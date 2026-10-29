import { NO_ACTORS_CODE } from '@xo/engine'
import { z } from 'zod'
import { isChatId } from '@/lib/chat-id'
import { getSessionUser } from '@/lib/session'
import { storage } from '@/lib/storage'
import { getOwnedChat } from '@/server/chats'
import { checkReadiness } from '@/server/readiness/check'
import { documentText } from '@/server/readiness/document-text'
import { allowCheck } from '@/server/readiness/rate-limit'
import { checkRunGate } from '@/server/run-gate'
import { runStore } from '@/server/runs'
import { readOwnedUploads } from '@/server/uploads'

export const runtime = 'nodejs'
export const maxDuration = 30

const bodySchema = z.union([
  z.object({ retry: z.literal(true) }),
  z.object({ text: z.string(), uploadIds: z.array(z.string()) }),
])

async function loadDocuments(uploads: Array<{ filename: string; mediaType: string; storageKey: string }>) {
  return Promise.all(
    uploads.map(async (upload) => {
      const bytes = await storage.get(upload.storageKey).catch(() => null)
      const text = bytes ? await documentText({ bytes, mediaType: upload.mediaType, filename: upload.filename }) : ''
      return { filename: upload.filename, text }
    }),
  )
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(request.headers)
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 })

  const { id: chatId } = await params
  const owned = await getOwnedChat(chatId, user.id)
  if (!owned && !isChatId(chatId)) return Response.json({ error: 'not_found' }, { status: 404 })

  const body = bodySchema.safeParse(await request.json().catch(() => null))
  if (!body.success) return Response.json({ error: 'invalid_body' }, { status: 400 })

  const gate = await checkRunGate(user, { spendsQuota: !('retry' in body.data) })
  if (!gate.ok) return gate.response

  if ('retry' in body.data) {
    const latest = owned ? await runStore.getLatestByChat(chatId) : null
    if (latest?.status !== 'failed' || latest.error?.code !== NO_ACTORS_CODE)
      return Response.json({ error: 'run_not_failed' }, { status: 409 })
    if (!allowCheck(user.id)) return Response.json({ ready: true })
    const uploadIds = [...new Set(latest.config.uploadIds)]
    const rows = await readOwnedUploads({ chatId, userId: user.id, uploadIds })
    const documents = await loadDocuments(
      rows.filter((row) => !(row.filename === 'seed.md' && row.mediaType === 'text/markdown')),
    )
    return Response.json(await checkReadiness({ text: latest.config.requirement, documents, force: true }))
  }

  const { text } = body.data
  const uploadIds = [...new Set(body.data.uploadIds)]
  const rows = await readOwnedUploads({ chatId, userId: user.id, uploadIds })
  if (rows.length !== uploadIds.length) return Response.json({ error: 'invalid_body' }, { status: 400 })
  if (!allowCheck(user.id)) return Response.json({ ready: true })
  const documents = await loadDocuments(rows)
  return Response.json(await checkReadiness({ text, documents }))
}
