import { z } from 'zod'
import { getSessionUser } from '@/lib/session'
import { storage } from '@/lib/storage'
import { MAX_FILES } from '@/server/upload-rules'
import { type UploadTokenPayload, verifyUploadToken } from '@/server/upload-token'
import { recordUploads } from '@/server/uploads'

export const runtime = 'nodejs'

const bodySchema = z.object({
  chatId: z.string().min(1),
  tokens: z.array(z.string()).min(1).max(MAX_FILES),
})

export async function POST(request: Request) {
  const user = await getSessionUser(request.headers)
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 })

  const body = bodySchema.safeParse(await request.json().catch(() => null))
  if (!body.success || !storage.head) return Response.json({ error: 'invalid_body' }, { status: 400 })
  const { chatId, tokens } = body.data

  const payloads = tokens.map(verifyUploadToken)
  const files = payloads.filter(
    (p): p is UploadTokenPayload => p !== null && p.userId === user.id && p.chatId === chatId,
  )
  if (files.length !== tokens.length || new Set(files.map((f) => f.id)).size !== files.length) {
    return Response.json({ error: 'invalid_body' }, { status: 400 })
  }

  const objects = await Promise.all(files.map((file) => storage.head!(file.key)))
  if (objects.some((object, index) => object?.size !== files[index]!.size)) {
    return Response.json({ error: 'upload_rejected', reason: 'missing' }, { status: 400 })
  }

  const uploads = await recordUploads({
    chatId,
    userId: user.id,
    files: files.map((file) => ({
      id: file.id,
      storageKey: file.key,
      name: file.name,
      mediaType: file.mediaType,
      size: file.size,
    })),
  })
  return Response.json({ uploads }, { status: 201 })
}
