import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { currentPackageSuffix, testDatabaseUrl } from './test-url'

const MIGRATIONS = fileURLToPath(new URL('../drizzle', import.meta.url))
const LOCK_KEY = 727

export default async function setup() {
  const raw = testDatabaseUrl(currentPackageSuffix())
  if (!raw) return
  const url = new URL(raw)
  const name = url.pathname.slice(1)
  if (!/^[a-z0-9_]+$/.test(name)) throw new Error(`unsafe test database name: ${name}`)

  const admin = postgres(Object.assign(new URL(raw), { pathname: '/postgres' }).toString(), { max: 1 })
  try {
    const found = await admin`select 1 from pg_database where datname = ${name}`
    if (found.length === 0) await admin.unsafe(`create database ${name}`)
  } catch (err) {
    await admin.end({ timeout: 1 }).catch(() => {})
    console.warn(`test database setup skipped: ${(err as Error).message}`)
    return
  }
  await admin.end()

  const client = postgres(raw, { max: 1 })
  try {
    await client`select pg_advisory_lock(${LOCK_KEY})`
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS })
    await client`delete from runs where status in ('queued', 'running')`
    await client`select pg_advisory_unlock(${LOCK_KEY})`
  } finally {
    await client.end()
  }
}
