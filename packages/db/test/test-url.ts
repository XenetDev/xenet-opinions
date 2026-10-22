import { readFileSync } from 'node:fs'

export function deriveTestUrl(base: string, name: string) {
  const url = new URL(base)
  url.pathname = `${url.pathname.replace(/\/$/, '')}_${name}`
  return url.toString()
}

function baseTestUrl(env: Record<string, string | undefined>): string | undefined {
  if (env.TEST_DATABASE_URL) return env.TEST_DATABASE_URL
  if (env.DATABASE_URL) {
    const url = new URL(env.DATABASE_URL)
    url.pathname = '/xo_test'
    return url.toString()
  }
}

export function testDatabaseUrl(pkg: string, env: Record<string, string | undefined> = process.env) {
  const base = baseTestUrl(env)
  return base ? deriveTestUrl(base, pkg) : undefined
}

export function currentPackageSuffix() {
  return (JSON.parse(readFileSync('package.json', 'utf8')).name as string).split('/').pop()!
}
