import { getSessionUser } from '@/lib/session'
import { getOwnedChat } from '@/server/chats'
import { validateUploads } from '@/server/upload-rules'
import { createUploads } from '@/server/uploads'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const user = await getSessionUser(request.headers)
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 })

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return Response.json({ error: 'invalid_body' }, { status: 400 })
  }
  const chatId = form.get('chatId')
  const files = form.getAll('files').filter((entry): entry is File => typeof entry !== 'string')
  if (typeof chatId !== 'string' || !chatId || files.length === 0) {
    return Response.json({ error: 'invalid_body' }, { status: 400 })
  }

  const chat = await getOwnedChat(chatId, user.id)
  if (!chat) return Response.json({ error: 'not_found' }, { status: 404 })

  const validation = validateUploads(files)
  if (!validation.ok) return Response.json({ error: 'upload_rejected', reason: validation.reason }, { status: 400 })

  const uploads = await createUploads({
    chatId,
    userId: user.id,
    files: await Promise.all(
      validation.files.map(async (file, index) => ({
        ...file,
        bytes: new Uint8Array(await files[index]!.arrayBuffer()),
      })),
    ),
  })
  return Response.json({ uploads }, { status: 201 })
}
