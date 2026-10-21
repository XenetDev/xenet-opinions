import { loadRootEnv } from '@xo/config/env'
import { defineConfig } from 'drizzle-kit'

loadRootEnv(import.meta.url)

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is not set')

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './drizzle',
  dbCredentials: { url },
})
