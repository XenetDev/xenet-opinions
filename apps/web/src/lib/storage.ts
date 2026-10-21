import { existsSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { createStorageFromEnv } from '@xo/storage'
import { env } from '@/env'

function findRepoRoot(start: string): string {
  let dir = start
  while (!existsSync(join(dir, 'pnpm-workspace.yaml'))) {
    const parent = dirname(dir)
    if (parent === dir) return start
    dir = parent
  }
  return dir
}

const localDir = isAbsolute(env.STORAGE_LOCAL_DIR)
  ? env.STORAGE_LOCAL_DIR
  : resolve(findRepoRoot(process.cwd()), env.STORAGE_LOCAL_DIR)

export const storage = createStorageFromEnv({ ...env, STORAGE_LOCAL_DIR: localDir })
