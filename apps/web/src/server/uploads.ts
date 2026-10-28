import { schema } from '@xo/db'
import { uploadKey } from '@xo/storage'
import { generateId } from 'ai'
import { db } from '@/lib/db'
import { storage } from '@/lib/storage'
import type { ValidatedFile } from '@/server/upload-rules'

const { uploads } = schema

export type UploadSummary = { id: string; filename: string; mediaType: string; sizeBytes: number }

export async function createUploads(input: {
  chatId: string
  userId: string
  files: Array<ValidatedFile & { bytes: Uint8Array }>
}): Promise<UploadSummary[]> {
  const written: string[] = []
  const rows: Array<typeof uploads.$inferInsert> = []
  try {
    for (const file of input.files) {
      const id = generateId()
      const storageKey = uploadKey(input.userId, id, file.name)
      await storage.put(storageKey, file.bytes, file.mediaType)
      written.push(storageKey)
      rows.push({
        id,
        userId: input.userId,
        chatId: input.chatId,
        storageKey,
        filename: file.name,
        mediaType: file.mediaType,
        sizeBytes: file.size,
      })
    }
    await db.insert(uploads).values(rows)
  } catch (error) {
    await Promise.allSettled(written.map((key) => storage.delete(key)))
    throw error
  }
  return rows.map((row) => ({ id: row.id, filename: row.filename, mediaType: row.mediaType, sizeBytes: row.sizeBytes }))
}

export async function createSeedUpload(input: {
  chatId: string
  userId: string
  document: string
}): Promise<UploadSummary> {
  const bytes = new TextEncoder().encode(input.document)
  const [seed] = await createUploads({
    chatId: input.chatId,
    userId: input.userId,
    files: [{ name: 'seed.md', mediaType: 'text/markdown', size: bytes.byteLength, bytes }],
  })
  return seed!
}
