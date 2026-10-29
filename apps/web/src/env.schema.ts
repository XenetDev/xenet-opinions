import { MIROFISH_LOCALES } from '@xo/mirofish'
import { z } from 'zod'

const optionalString = z.preprocess((v) => (v === '' ? undefined : v), z.string().optional())

const EMAIL_FROM_PATTERN = /^(?:[^<>]+ <[^\s<>@]+@[^\s<>@]+>|[^\s<>@]+@[^\s<>@]+)$/

export const envSchema = z
  .object({
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    NEXT_PUBLIC_APP_URL: z.url(),
    MIROFISH_URL: z.url(),
    MIROFISH_TOKEN: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
    MIROFISH_LOCALE: z.preprocess((v) => (v === '' ? undefined : v), z.enum(MIROFISH_LOCALES).default('en')),
    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    STORAGE_LOCAL_DIR: z.string().default('.data/uploads'),
    STORAGE_DIRECT_UPLOADS: z.enum(['1', '0']).default('1'),
    S3_BUCKET: z.string().optional(),
    S3_REGION: z.string().optional(),
    S3_ENDPOINT: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_FORCE_PATH_STYLE: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['true', 'false']).optional()),
    WORKER_POLL_MS: z.coerce.number().int().default(2000),
    MAX_CONCURRENT_RUNS: z.coerce.number().int().default(1),
    HEALTH_CHECK_MIROFISH: z.enum(['1', '0']).default('1'),
    DEMO_MODE: z.enum(['1', '0']).default('0'),
    DEMO_PAUSED: z.enum(['1', '0']).default('0'),
    DEMO_ALLOW_PAUSE: z.enum(['1', '0']).default('1'),
    MAX_RUNS_PER_DAY_ANONYMOUS: z.coerce.number().int().min(0).default(1),
    MAX_RUNS_PER_DAY: z.coerce.number().int().min(0).default(3),
    RESEND_API_KEY: optionalString,
    EMAIL_FROM: z.preprocess((v) => (v === '' ? undefined : v), z.string().regex(EMAIL_FROM_PATTERN).optional()),
    GOOGLE_CLIENT_ID: optionalString,
    GOOGLE_CLIENT_SECRET: optionalString,
    GITHUB_CLIENT_ID: optionalString,
    GITHUB_CLIENT_SECRET: optionalString,
    APPLE_CLIENT_ID: optionalString,
    APPLE_CLIENT_SECRET: optionalString,
    APPLE_APP_BUNDLE_IDENTIFIER: optionalString,
    DEMO_MAX_ROUNDS: z.coerce.number().int().min(1).max(40).default(3),
    LLM_API_KEY: optionalString,
    LLM_BASE_URL: z.preprocess((v) => (v === '' ? undefined : v), z.url().default('https://api.openai.com/v1')),
    LLM_MODEL_NAME: z.preprocess((v) => (v === '' ? undefined : v), z.string().default('gpt-4o-mini')),
  })
  .superRefine((env, ctx) => {
    if (env.STORAGE_DRIVER === 's3') {
      for (const key of ['S3_BUCKET', 'S3_REGION', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const) {
        if (!env[key])
          ctx.addIssue({ code: 'custom', path: [key], message: `${key} is required when STORAGE_DRIVER is s3` })
      }
    }
    const pairs = [
      ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
      ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'],
      ['APPLE_CLIENT_ID', 'APPLE_CLIENT_SECRET'],
    ] as const
    for (const [id, secret] of pairs) {
      if (!env[id] !== !env[secret]) {
        const missing = env[id] ? secret : id
        ctx.addIssue({
          code: 'custom',
          path: [missing],
          message: `${missing} is required when ${missing === id ? secret : id} is set`,
        })
      }
    }
    if (env.RESEND_API_KEY && !env.EMAIL_FROM)
      ctx.addIssue({
        code: 'custom',
        path: ['EMAIL_FROM'],
        message: 'EMAIL_FROM is required when RESEND_API_KEY is set',
      })
  })

export type Env = z.infer<typeof envSchema>

export function parseEnv(source: Record<string, string | undefined>): Env {
  return envSchema.parse(source)
}
