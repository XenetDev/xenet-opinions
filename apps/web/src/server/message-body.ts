import { MAX_INTERVIEW_AGENTS, SEED_ACTORS_MAX, SEED_FIELD_MAX } from '@xo/engine'
import { PANEL_AUDIENCE_MAX, PANEL_GROUPS, PANEL_MAX_PARTICIPANTS, PANEL_MIN_PARTICIPANTS } from '@xo/engine/policy'
import { z } from 'zod'
import { MAX_FILES } from './upload-rules'

const seedField = (max: number) => z.string().trim().max(max).optional()

const groupIds = PANEL_GROUPS.map((group) => group.id) as [
  (typeof PANEL_GROUPS)[number]['id'],
  ...(typeof PANEL_GROUPS)[number]['id'][],
]

export const panelSchema = z.object({
  participants: z.number().int().min(PANEL_MIN_PARTICIPANTS).max(PANEL_MAX_PARTICIPANTS),
  audience: z.string().trim().max(PANEL_AUDIENCE_MAX).optional(),
  groups: z.array(z.enum(groupIds)).max(PANEL_GROUPS.length),
  webResearch: z.boolean(),
})

export const seedSchema = z.object({
  background: seedField(SEED_FIELD_MAX),
  actors: seedField(SEED_ACTORS_MAX),
  change: seedField(SEED_FIELD_MAX),
})

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
  panel: panelSchema.optional(),
  researchId: z.string().min(1).max(64).optional(),
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
