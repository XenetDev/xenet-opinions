import { hostname } from 'node:os'
import { MIROFISH_LOCALES } from '@xo/mirofish'
import { z } from 'zod'

const optional = z
  .string()
  .optional()
  .transform((v) => v || undefined)

export const workerEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  MIROFISH_URL: z.string().min(1),
  MIROFISH_TOKEN: optional,
  MIROFISH_LOCALE: z.preprocess((v) => v || undefined, z.enum(MIROFISH_LOCALES).default('en')),
  STORAGE_DRIVER: z.string().min(1).default('local'),
  STORAGE_LOCAL_DIR: z.string().min(1).default('.data/uploads'),
  S3_BUCKET: optional,
  S3_REGION: optional,
  S3_ENDPOINT: optional,
  S3_ACCESS_KEY_ID: optional,
  S3_SECRET_ACCESS_KEY: optional,
  S3_FORCE_PATH_STYLE: optional,
  WORKER_POLL_MS: z.coerce.number().int().positive().default(2000),
  ENV_KEEPALIVE_MS: z.coerce.number().int().positive().default(1_200_000),
  ENV_SWEEP_INTERVAL_MS: z.coerce.number().int().nonnegative().default(60_000),
  MAX_CONCURRENT_RUNS: z.coerce.number().int().positive().default(1),
  WORKER_ID: z.string().min(1).default(`${hostname()}-${process.pid}`),
  LLM_API_KEY: optional,
  LLM_BASE_URL: z.preprocess((v) => v || undefined, z.url().default('https://api.openai.com/v1')),
  LLM_MODEL_NAME: z.preprocess((v) => v || undefined, z.string().default('gpt-4o-mini')),
})

export type WorkerEnv = z.infer<typeof workerEnvSchema>

export const parseWorkerEnv = (env: NodeJS.ProcessEnv = process.env): WorkerEnv => workerEnvSchema.parse(env)
