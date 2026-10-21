import { existsSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadRootEnv } from '@xo/config/env'
import { createDb } from '@xo/db'
import { createDrizzleStore } from '@xo/engine'
import { createMiroFishClient } from '@xo/mirofish'
import { createStorageFromEnv } from '@xo/storage'
import { parseWorkerEnv } from './env'
import { log } from './log'
import { runWorkerLoop } from './loop'

const LEASE_MS = 60_000

const findRepoRoot = (from: string) => {
  let dir = dirname(fileURLToPath(from))
  while (!existsSync(join(dir, 'pnpm-workspace.yaml'))) {
    const parent = dirname(dir)
    if (parent === dir) return process.cwd()
    dir = parent
  }
  return dir
}

async function main() {
  loadRootEnv(import.meta.url)
  const env = parseWorkerEnv()
  const localDir = isAbsolute(env.STORAGE_LOCAL_DIR) ? env.STORAGE_LOCAL_DIR : resolve(findRepoRoot(import.meta.url), env.STORAGE_LOCAL_DIR)

  const db = createDb(env.DATABASE_URL)
  const controller = new AbortController()
  const stop = (signal: string) => {
    log('shutdown requested', { signal })
    controller.abort()
  }
  process.once('SIGINT', () => stop('SIGINT'))
  process.once('SIGTERM', () => stop('SIGTERM'))

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(done, ms)
      function done() {
        clearTimeout(timer)
        controller.signal.removeEventListener('abort', done)
        resolve()
      }
      controller.signal.addEventListener('abort', done, { once: true })
    })

  log('worker starting', { owner: env.WORKER_ID, pollMs: env.WORKER_POLL_MS, maxConcurrent: env.MAX_CONCURRENT_RUNS })
  try {
    await runWorkerLoop({
      store: createDrizzleStore(db),
      mirofish: createMiroFishClient({ baseUrl: env.MIROFISH_URL, token: env.MIROFISH_TOKEN }),
      storage: createStorageFromEnv({ ...env, STORAGE_LOCAL_DIR: localDir }),
      now: () => new Date(),
      sleep,
      log,
      owner: env.WORKER_ID,
      leaseMs: LEASE_MS,
      pollMs: env.WORKER_POLL_MS,
      maxConcurrent: env.MAX_CONCURRENT_RUNS,
      signal: controller.signal,
    })
  } finally {
    await db.$client.end()
  }
  log('worker stopped')
}

main().catch((err) => {
  log('worker crashed', { error: err })
  process.exit(1)
})
