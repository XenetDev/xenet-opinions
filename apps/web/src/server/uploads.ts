import { schema } from '@xo/db'
import { uploadKey } from '@xo/storage'
import { generateId } from 'ai'
import { db } from '@/lib/db'
import { storage } from '@/lib/storage'
import type { ValidatedFile } from '@/server/upload-rules'

const { uploads } = schema

export type UploadSummary = { id: string; filename: string; mediaType: string; sizeBytes: number }

export async function recordUploads(input: {
  chatId: string
  userId: string
  files: Array<{ id: string; storageKey: string; name: string; mediaType: string; size: number }>
}): Promise<UploadSummary[]> {
  const rows = input.files.map((file) => ({
    id: file.id,
    userId: input.userId,
    chatId: input.chatId,
    storageKey: file.storageKey,
    filename: file.name,
    mediaType: file.mediaType,
    sizeBytes: file.size,
  }))
  await db.insert(uploads).values(rows)
  return rows.map((row) => ({ id: row.id, filename: row.filename, mediaType: row.mediaType, sizeBytes: row.sizeBytes }))
}

export async function createUploads(input: {
  chatId: string
  userId: string
  files: Array<ValidatedFile & { bytes: Uint8Array }>
}): Promise<UploadSummary[]> {
  const written: Array<{ id: string; storageKey: string; name: string; mediaType: string; size: number }> = []
  try {
    for (const file of input.files) {
      const id = generateId()
      const storageKey = uploadKey(input.userId, id, file.name)
      await storage.put(storageKey, file.bytes, file.mediaType)
      written.push({ id, storageKey, name: file.name, mediaType: file.mediaType, size: file.size })
    }
    return await recordUploads({ chatId: input.chatId, userId: input.userId, files: written })
  } catch (error) {
    await Promise.allSettled(written.map((file) => storage.delete(file.storageKey)))
    throw error
  }
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
