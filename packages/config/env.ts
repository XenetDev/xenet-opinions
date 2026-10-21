import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export function loadRootEnv(importMetaUrl: string): void {
  let dir = dirname(fileURLToPath(importMetaUrl))
  while (!existsSync(join(dir, 'pnpm-workspace.yaml'))) {
    const parent = dirname(dir)
    if (parent === dir) return
    dir = parent
  }
  try { process.loadEnvFile(join(dir, '.env')) } catch {}
}
