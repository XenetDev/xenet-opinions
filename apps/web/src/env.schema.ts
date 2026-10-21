import { z } from 'zod'

export const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  NEXT_PUBLIC_APP_URL: z.url(),
  MIROFISH_URL: z.url(),
  MIROFISH_TOKEN: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('.data/uploads'),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['true', 'false']).optional()),
  WORKER_POLL_MS: z.coerce.number().int().default(2000),
  MAX_CONCURRENT_RUNS: z.coerce.number().int().default(1),
}).superRefine((env, ctx) => {
  if (env.STORAGE_DRIVER !== 's3') return
  for (const key of ['S3_BUCKET', 'S3_REGION', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const) {
    if (!env[key]) ctx.addIssue({ code: 'custom', path: [key], message: `${key} is required when STORAGE_DRIVER is s3` })
  }
})

export type Env = z.infer<typeof envSchema>

export function parseEnv(source: Record<string, string | undefined>): Env {
  return envSchema.parse(source)
}
