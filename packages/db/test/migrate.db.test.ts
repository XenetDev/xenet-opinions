import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const cwd = fileURLToPath(new URL('..', import.meta.url))
const run = (databaseUrl: string) =>
  spawnSync('pnpm', ['exec', 'tsx', 'src/migrate.ts'], {
    cwd,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: 'utf8',
    timeout: 60_000,
    killSignal: 'SIGKILL',
  })

describe.skipIf(!process.env.DATABASE_URL)('production migrator', () => {
  it('is idempotent', () => {
    for (let i = 0; i < 2; i++) {
      const res = run(process.env.DATABASE_URL as string)
      expect(res.status).not.toBeNull()
      expect(res.status).toBe(0)
      expect(res.stdout.trim()).toBe('migrated')
    }
  }, 60_000)

  it('exits 1 with a single-line error when the database is unreachable', () => {
    const res = run('postgresql://xo:xo@127.0.0.1:1/none')
    expect(res.status).toBe(1)
    expect(res.stderr).toMatch(/^[A-Za-z_0-9]+\n$/)
    expect(res.stderr).not.toMatch(/127\.0\.0\.1|xo:/)
  }, 60_000)

  it('fails fast when DATABASE_URL is unset', () => {
    const res = spawnSync('pnpm', ['exec', 'tsx', 'src/migrate.ts'], {
      cwd,
      env: { ...process.env, DATABASE_URL: '' },
      encoding: 'utf8',
      timeout: 60_000,
      killSignal: 'SIGKILL',
    })
    expect(res.status).toBe(1)
    expect(res.stderr).toBe('MissingDatabaseUrl\n')
  }, 60_000)
})
