import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/storage', () => ({ storage: { put: vi.fn(), get: vi.fn(), delete: vi.fn() } }))
vi.mock('@/lib/db', () => ({ db: { insert: vi.fn() } }))

import { db } from '@/lib/db'
import { storage } from '@/lib/storage'
import { createUploads } from './uploads'

const file = (name: string) => ({ name, mediaType: 'text/plain', size: 1, bytes: new Uint8Array([1]) })

beforeEach(() => {
  vi.resetAllMocks()
})

describe('createUploads', () => {
  it('rolls back written blobs without inserting rows when a later put fails', async () => {
    vi.mocked(storage.put).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('boom'))
    vi.mocked(storage.delete).mockResolvedValue(undefined)
    await expect(createUploads({ chatId: 'c1', userId: 'u1', files: [file('a.txt'), file('b.txt')] })).rejects.toThrow('boom')
    expect(db.insert).not.toHaveBeenCalled()
    const firstKey = vi.mocked(storage.put).mock.calls[0]![0]
    expect(storage.delete).toHaveBeenCalledTimes(1)
    expect(storage.delete).toHaveBeenCalledWith(firstKey)
  })

  it('inserts all rows in one call after all blobs are written', async () => {
    const values = vi.fn().mockResolvedValue(undefined)
    vi.mocked(storage.put).mockResolvedValue(undefined)
    vi.mocked(db.insert).mockReturnValue({ values } as never)
    const result = await createUploads({ chatId: 'c1', userId: 'u1', files: [file('a.txt'), file('b.txt')] })
    expect(values).toHaveBeenCalledTimes(1)
    expect(values.mock.calls[0]![0]).toHaveLength(2)
    expect(result.map((r) => r.filename)).toEqual(['a.txt', 'b.txt'])
  })
})
