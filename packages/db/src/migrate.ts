import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url))

const fail = (name: string): never => {
  console.error(name)
  process.exit(1)
}

const url = process.env.DATABASE_URL
if (!url) fail('MissingDatabaseUrl')

const client = postgres(url as string, { max: 1, onnotice: () => {} })
try {
  await migrate(drizzle(client), { migrationsFolder })
  console.log('migrated')
  await client.end()
  process.exit(0)
} catch (err) {
  await client.end({ timeout: 1 }).catch(() => {})
  const e = err as { code?: string; name?: string }
  fail(e.code ?? e.name ?? 'Error')
}
