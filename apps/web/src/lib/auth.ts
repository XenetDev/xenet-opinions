import { betterAuth } from 'better-auth'
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { anonymous } from 'better-auth/plugins'
import { schema } from '@xo/db'
import { db } from '@/lib/db'
import { env } from '@/env'

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  plugins: [anonymous()],
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
})
