import { z } from 'zod'

export const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  NEXT_PUBLIC_APP_URL: z.url(),
  MIROFISH_URL: z.url(),
  MIROFISH_TOKEN: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
})

export type Env = z.infer<typeof envSchema>

export function parseEnv(source: Record<string, string | undefined>): Env {
  return envSchema.parse(source)
}
