import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { schema } from '@xo/db'
import { betterAuth } from 'better-auth'
import { anonymous } from 'better-auth/plugins'
import { env } from '@/env'
import { db } from '@/lib/db'

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  plugins: [anonymous()],
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
})
