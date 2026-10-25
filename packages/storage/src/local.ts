import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { type Storage, StorageError } from './types'

export function createLocalStorage(rootDir: string): Storage {
  const root = resolve(/* turbopackIgnore: true */ process.cwd(), rootDir)

  function pathFor(key: string): string {
    if (key === '' || key.includes('\\') || key.includes('\0') || key.startsWith('/')) {
      throw new StorageError('invalid_key', `invalid key: ${JSON.stringify(key)}`)
    }
    const segments = key.split('/')
    if (segments.some((s) => s === '' || s === '.' || s === '..')) {
      throw new StorageError('invalid_key', `invalid key: ${JSON.stringify(key)}`)
    }
    const full = resolve(/* turbopackIgnore: true */ root, ...segments)
    if (!full.startsWith(root + sep)) {
      throw new StorageError('invalid_key', `invalid key: ${JSON.stringify(key)}`)
    }
    return full
  }

  return {
    async put(key, bytes) {
      const path = pathFor(key)
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, bytes)
    },
    async get(key) {
      const path = pathFor(key)
      try {
        return new Uint8Array(await readFile(path))
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw new StorageError('not_found', `not found: ${key}`)
        throw err
      }
    },
    async delete(key) {
      await rm(pathFor(key), { force: true })
    },
  }
}
