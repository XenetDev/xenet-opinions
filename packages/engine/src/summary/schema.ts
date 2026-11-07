import { z } from 'zod'

export const SENTIMENT_MIN = -5
export const SENTIMENT_MAX = 5

export const ACTIONS = ['act', 'not_act', 'unsure', 'n/a'] as const
export const ActionSchema = z.enum(ACTIONS)
export type Action = z.infer<typeof ActionSchema>

export const KindSchema = z.enum(['person', 'organisation'])
export type Kind = z.infer<typeof KindSchema>

const SentimentSchema = z.number().min(SENTIMENT_MIN).max(SENTIMENT_MAX)
const ShareSchema = z.number().min(0).max(1)
const Count = z.number().int().min(0)

export const HeadlineSchema = z.object({
  sentiment: SentimentSchema.nullable(),
  actShare: ShareSchema.nullable(),
  switchShare: ShareSchema.nullable(),
  topConcern: z.object({ label: z.string(), count: Count }).nullable(),
})
export type Headline = z.infer<typeof HeadlineSchema>

export const SplitSchema = z.object({ positive: Count, neutral: Count, negative: Count })
export type Split = z.infer<typeof SplitSchema>

export const SummaryGroupSchema = z.object({
  id: z.string(),
  label: z.string(),
  people: Count,
  sentiment: SentimentSchema.nullable(),
  actShare: ShareSchema.nullable(),
  summary: z.string(),
})
export type SummaryGroup = z.infer<typeof SummaryGroupSchema>

export const FindingSchema = z.object({
  title: z.string(),
  detail: z.string(),
  quote: z.object({ text: z.string(), name: z.string() }).optional(),
})
export type Finding = z.infer<typeof FindingSchema>

export const ParticipantSchema = z.object({
  agentId: z.string(),
  name: z.string(),
  age: z.number().int().optional(),
  role: z.string().optional(),
  location: z.string().optional(),
  group: z.string(),
  kind: KindSchema,
  sentiment: SentimentSchema.nullable(),
  action: ActionSchema,
  opinion: z.string(),
  quote: z.string().optional(),
})
export type Participant = z.infer<typeof ParticipantSchema>

export const ReportSummarySchema = z.object({
  verdict: z.string(),
  confidence: z.object({ level: z.enum(['low', 'medium', 'high']), reason: z.string() }),
  headline: HeadlineSchema,
  split: SplitSchema,
  groups: z.array(SummaryGroupSchema),
  findings: z.array(FindingSchema).max(5),
  risks: z.array(z.string()),
  opportunities: z.array(z.string()),
  participants: z.array(ParticipantSchema),
  sources: z.array(z.object({ title: z.string(), url: z.string() })),
  method: z.object({ participants: Count, groups: Count, rounds: Count, webResearch: z.boolean() }),
  writeup: z.string(),
})
export type ReportSummary = z.infer<typeof ReportSummarySchema>

export const ReportSummaryFailedSchema = z.object({ message: z.string() })
export type ReportSummaryFailed = z.infer<typeof ReportSummaryFailedSchema>
