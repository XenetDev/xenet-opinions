import { buildSeedDocument, NO_ACTORS_CODE } from '@xo/engine'
import { z } from 'zod'
import { getSessionUser } from '@/lib/session'
import { getOwnedChat } from '@/server/chats'
import { getLimits } from '@/server/limits'
import { seedSchema } from '@/server/message-body'
import { retryRun } from '@/server/retry'
import { RunActiveError, RunNotFailedError, runStore } from '@/server/runs'
import { createSeedUpload, readOwnedUploads } from '@/server/uploads'

export const runtime = 'nodejs'

const retryBodySchema = z.object({ seed: seedSchema.optional() })

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(request.headers)
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 })

  const { id: chatId } = await params
  const chat = await getOwnedChat(chatId, user.id)
  if (!chat) return Response.json({ error: 'not_found' }, { status: 404 })
  if (getLimits(user).paused) return Response.json({ error: 'demo_paused' }, { status: 409 })

  const raw = await request.text()
  const parsed = retryBodySchema.safeParse(raw ? parseJson(raw) : {})
  if (!parsed.success) return Response.json({ error: 'invalid_body' }, { status: 400 })
  const { seed } = parsed.data

  if (await runStore.getActiveByChat(chatId)) return Response.json({ error: 'run_active' }, { status: 409 })
  const latest = await runStore.getLatestByChat(chatId)
  if (latest?.status !== 'failed') return Response.json({ error: 'run_not_failed' }, { status: 409 })
  if (seed && latest.error?.code !== NO_ACTORS_CODE) return Response.json({ error: 'run_not_failed' }, { status: 409 })

  try {
    let restart: { uploadIds: string[] } | undefined
    if (seed) {
      const owned = await readOwnedUploads({ chatId, userId: user.id, uploadIds: latest.config.uploadIds })
      const seedIds = new Set(
        owned.filter((u) => u.filename === 'seed.md' && u.mediaType === 'text/markdown').map((u) => u.id),
      )
      const document = buildSeedDocument({ question: latest.config.requirement, ...seed })
      const created = await createSeedUpload({ chatId, userId: user.id, document })
      restart = { uploadIds: [...latest.config.uploadIds.filter((id) => !seedIds.has(id)), created.id] }
    }
    const { run, assistantMessageId } = await retryRun({ chatId, userId: user.id, restart })
    return Response.json({ runId: run.id, assistantMessageId }, { status: 201 })
  } catch (error) {
    if (error instanceof RunActiveError) return Response.json({ error: 'run_active' }, { status: 409 })
    if (error instanceof RunNotFailedError) return Response.json({ error: 'run_not_failed' }, { status: 409 })
    throw error
  }
}
