import { uploadKey } from '@xo/storage'
import { generateId } from 'ai'
import { z } from 'zod'
import { env } from '@/env'
import { isChatId } from '@/lib/chat-id'
import { getSessionUser } from '@/lib/session'
import { storage } from '@/lib/storage'
import { ensureOwnedChat, getOwnedChat } from '@/server/chats'
import { validateUploads } from '@/server/upload-rules'
import { signUploadToken } from '@/server/upload-token'

export const runtime = 'nodejs'

const EXPIRES_IN_SECONDS = 10 * 60

const bodySchema = z.object({
  chatId: z.string().min(1),
  files: z.array(z.object({ name: z.string(), type: z.string(), size: z.number().int().nonnegative() })).min(1),
})

export async function POST(request: Request) {
  const user = await getSessionUser(request.headers)
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 })

  const body = bodySchema.safeParse(await request.json().catch(() => null))
  if (!body.success) return Response.json({ error: 'invalid_body' }, { status: 400 })
  const { chatId, files } = body.data

  const owned = await getOwnedChat(chatId, user.id)
  if (!owned && !isChatId(chatId)) return Response.json({ error: 'not_found' }, { status: 404 })

  const validation = validateUploads(files)
  if (!validation.ok) return Response.json({ error: 'upload_rejected', reason: validation.reason }, { status: 400 })
  if (!owned && !(await ensureOwnedChat(chatId, user.id))) return Response.json({ error: 'not_found' }, { status: 404 })

  if (!storage.presignPut || env.STORAGE_DIRECT_UPLOADS === '0') return Response.json({ mode: 'form' })

  const exp = Date.now() + EXPIRES_IN_SECONDS * 1000
  const uploads = await Promise.all(
    validation.files.map(async (file) => {
      const id = generateId()
      const key = uploadKey(user.id, id, file.name)
      const { url, headers } = await storage.presignPut!(key, {
        contentType: file.mediaType,
        contentLength: file.size,
        expiresInSeconds: EXPIRES_IN_SECONDS,
      })
      const token = signUploadToken({
        userId: user.id,
        chatId,
        id,
        key,
        name: file.name,
        mediaType: file.mediaType,
        size: file.size,
        exp,
      })
      return { token, url, headers }
    }),
  )
  return Response.json({ mode: 'direct', uploads })
}
