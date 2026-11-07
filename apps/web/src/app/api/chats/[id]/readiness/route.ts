import { NO_ACTORS_CODE } from '@xo/engine'
import { z } from 'zod'
import { env } from '@/env'
import { isChatId } from '@/lib/chat-id'
import { getSessionUser } from '@/lib/session'
import { storage } from '@/lib/storage'
import { getOwnedChat } from '@/server/chats'
import { panelSchema } from '@/server/message-body'
import { checkReadiness } from '@/server/readiness/check'
import { documentText } from '@/server/readiness/document-text'
import { fallbackReadiness } from '@/server/readiness/fallback'
import { allowCheck } from '@/server/readiness/rate-limit'
import { type Research, researchQuestion } from '@/server/research/exa'
import { saveResearch } from '@/server/research/store'
import { checkRunGate } from '@/server/run-gate'
import { runStore } from '@/server/runs'
import { MAX_FILES } from '@/server/upload-rules'
import { readOwnedUploads } from '@/server/uploads'

export const runtime = 'nodejs'
export const maxDuration = 75

const LOAD_MS = 6000

const bodySchema = z.union([
  z.object({ retry: z.literal(true) }),
  z.object({
    text: z.string().max(20_000),
    uploadIds: z.array(z.string()).max(MAX_FILES),
    panel: panelSchema.optional(),
  }),
])

async function loadDocuments(uploads: Array<{ filename: string; mediaType: string; storageKey: string }>) {
  const texts = uploads.map(() => '')
  const loading = Promise.all(
    uploads.map(async (upload, index) => {
      const bytes = await storage.get(upload.storageKey).catch((error: unknown) => {
        console.error('readiness document read failed', { filename: upload.filename, error })
        return null
      })
      if (bytes) texts[index] = await documentText({ bytes, mediaType: upload.mediaType, filename: upload.filename })
    }),
  )
  let timer: ReturnType<typeof setTimeout> | undefined
  await Promise.race([loading, new Promise((resolve) => (timer = setTimeout(resolve, LOAD_MS)))])
  clearTimeout(timer)
  return uploads.map((upload, index) => ({ filename: upload.filename, text: texts[index] ?? '' }))
}

async function saveOwnedResearch(input: { userId: string; chatId: string; research: Research }) {
  try {
    return await saveResearch(input)
  } catch (error) {
    console.error('research save failed', { error })
    return null
  }
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
    const panel = panelSchema.safeParse(latest.config.panel)
    return Response.json(
      await checkReadiness({
        text: latest.config.requirement,
        documents,
        force: true,
        ...(panel.success && { panel: panel.data }),
      }),
    )
  }

  const { text, panel } = body.data
  const uploadIds = [...new Set(body.data.uploadIds)]
  const rows = await readOwnedUploads({ chatId, userId: user.id, uploadIds })
  if (rows.length !== uploadIds.length) return Response.json({ error: 'invalid_body' }, { status: 400 })
  if (!allowCheck(user.id)) return Response.json(fallbackReadiness(text, rows.length))
  const researching = panel?.webResearch && env.EXA_API_KEY ? researchQuestion(text) : Promise.resolve(null)
  const [documents, research] = await Promise.all([loadDocuments(rows), researching])
  const readiness = await checkReadiness({ text, documents, ...(panel && { panel }), ...(research && { research }) })
  const researchId = research && (await saveOwnedResearch({ userId: user.id, chatId, research }))
  return Response.json(researchId ? { ...readiness, researchId } : readiness)
}
