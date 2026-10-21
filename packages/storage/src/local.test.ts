import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLocalStorage } from './local'
import { StorageError } from './types'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'xo-storage-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('createLocalStorage', () => {
  it('round-trips bytes and creates parent dirs', async () => {
    const s = createLocalStorage(root)
    const bytes = new Uint8Array([0, 1, 2, 255])
    await s.put('a/b/c.bin', bytes, 'application/octet-stream')
    expect(await s.get('a/b/c.bin')).toEqual(bytes)
  })

  it('delete removes the file and tolerates missing keys', async () => {
    const s = createLocalStorage(root)
    await s.put('x.txt', new Uint8Array([1]), 'text/plain')
    await s.delete('x.txt')
    await expect(s.get('x.txt')).rejects.toMatchObject({ code: 'not_found' })
    await expect(s.delete('x.txt')).resolves.toBeUndefined()
  })

  it('get of a missing key throws not_found', async () => {
    const s = createLocalStorage(root)
    const err = await s.get('nope').catch((e) => e)
    expect(err).toBeInstanceOf(StorageError)
    expect(err.name).toBe('StorageError')
    expect(err.code).toBe('not_found')
  })

  it.each(['../x', '/abs', 'a/../../b', 'a\\b', '', 'a//b', './a'])('rejects key %j', async (key) => {
    const s = createLocalStorage(root)
    await expect(s.put(key, new Uint8Array([1]), 'text/plain')).rejects.toMatchObject({ code: 'invalid_key' })
    await expect(s.get(key)).rejects.toMatchObject({ code: 'invalid_key' })
    await expect(s.delete(key)).rejects.toMatchObject({ code: 'invalid_key' })
    expect(await readdir(root)).toEqual([])
    expect(await readdir(join(root, '..')).then((l) => l.includes('x'))).toBe(false)
  })

  it('resolves relative rootDir against cwd', async () => {
    const rel = `.tmp-storage-${process.pid}`
    const s = createLocalStorage(rel)
    try {
      await s.put('k', new Uint8Array([7]), 'text/plain')
      expect(await readdir(join(process.cwd(), rel))).toEqual(['k'])
    } finally {
      await rm(join(process.cwd(), rel), { recursive: true, force: true })
    }
  })
})
