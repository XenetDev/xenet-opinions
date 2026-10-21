import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { loadEnvConfig } from '@next/env'
import type { NextConfig } from 'next'

function findRepoRoot(start: string): string {
  let dir = start
  while (!existsSync(join(dir, 'pnpm-workspace.yaml'))) {
    const parent = dirname(dir)
    if (parent === dir) return start
    dir = parent
  }
  return dir
}

loadEnvConfig(findRepoRoot(process.cwd()), process.env.NODE_ENV !== 'production', console, true)

const nextConfig: NextConfig = {
  transpilePackages: ['@xo/db', '@xo/engine', '@xo/mirofish', '@xo/storage'],
}

export default nextConfig
