import { MAX_INTERVIEW_AGENTS, SEED_FIELD_MAX } from '@xo/engine'
import { z } from 'zod'
import { MAX_FILES } from './upload-rules'

const seedField = z.string().trim().max(SEED_FIELD_MAX).optional()

export const seedSchema = z.object({ background: seedField, actors: seedField, change: seedField })

const messageBodySchema = z.object({
  id: z.string(),
  message: z.object({
    id: z.string().min(1),
    role: z.literal('user'),
    parts: z.array(z.unknown()),
  }),
  uploadIds: z.array(z.string()).max(MAX_FILES).default([]),
  target: z.enum(['report', 'agents']).default('report'),
  agentIds: z.array(z.string().min(1).max(64)).max(MAX_INTERVIEW_AGENTS).default([]),
  runOptions: z
    .object({
      maxRounds: z.number().int().min(1).max(40).default(3),
      pauseForInterviews: z.boolean().default(false),
    })
    .default({ maxRounds: 3, pauseForInterviews: false }),
  seed: seedSchema.optional(),
})

export type MessageBody = z.infer<typeof messageBodySchema>

export function parseMessageBody(json: unknown): MessageBody | null {
  const parsed = messageBodySchema.safeParse(json)
  return parsed.success ? parsed.data : null
}

export function messageText(body: MessageBody): string {
  return body.message.parts
    .map((part) => {
      const candidate = part as { type?: unknown; text?: unknown }
      return candidate.type === 'text' && typeof candidate.text === 'string' ? candidate.text : ''
    })
    .join('')
    .trim()
}
