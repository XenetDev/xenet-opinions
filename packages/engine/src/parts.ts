import type { UIMessage } from 'ai'
import { z } from 'zod'

export const STAGES = [
  'ontology',
  'graph_build',
  'sim_create',
  'sim_prepare',
  'sim_run',
  'interviews',
  'report',
  'finished',
] as const
export type Stage = (typeof STAGES)[number]

const StageSchema = z.enum(STAGES)

export const StageStatusSchema = z.enum(['pending', 'running', 'done', 'failed', 'cancelled'])
export type StageStatus = z.infer<typeof StageStatusSchema>

export const StageDataSchema = z.object({
  stage: StageSchema,
  status: StageStatusSchema,
  progress: z.number().optional(),
  message: z.string().optional(),
})
export type StageData = z.infer<typeof StageDataSchema>

export const OntologyDataSchema = z.object({
  entityTypes: z.array(z.string()),
  relationTypes: z.array(z.string()),
  summary: z.string().optional(),
})
export type OntologyData = z.infer<typeof OntologyDataSchema>

export const GraphDataSchema = z.object({
  graphId: z.string(),
  nodeCount: z.number(),
  edgeCount: z.number(),
  nodes: z.array(z.object({ id: z.string(), label: z.string(), type: z.string().optional() })),
  links: z.array(z.object({ source: z.string(), target: z.string(), label: z.string().optional() })),
})
export type GraphData = z.infer<typeof GraphDataSchema>

export const AgentsDataSchema = z.object({
  count: z.number(),
  expected: z.number().optional(),
  profiles: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      handle: z.string().optional(),
      role: z.string().optional(),
      bio: z.string().optional(),
      topics: z.array(z.string()),
    }),
  ),
  platform: z.enum(['twitter', 'reddit']).optional(),
})
export type AgentsData = z.infer<typeof AgentsDataSchema>

export const SimFeedDataSchema = z.object({
  round: z.number(),
  totalRounds: z.number(),
  twitterActs: z.number(),
  redditActs: z.number(),
  posts: z.array(
    z.object({
      id: z.string(),
      platform: z.enum(['twitter', 'reddit']),
      agent: z.string(),
      content: z.string(),
      round: z.number(),
    }),
  ),
})
export type SimFeedData = z.infer<typeof SimFeedDataSchema>

export const ReportOutlineDataSchema = z.object({
  title: z.string().optional(),
  sections: z.array(z.object({ index: z.number(), title: z.string(), status: z.enum(['pending', 'writing', 'done']) })),
})
export type ReportOutlineData = z.infer<typeof ReportOutlineDataSchema>

export const ReportEventDataSchema = z.object({
  n: z.number(),
  action: z.string(),
  sectionIndex: z.number().optional(),
  sectionTitle: z.string().optional(),
  toolName: z.string().optional(),
  summary: z.string(),
  elapsedSeconds: z.number().optional(),
})
export type ReportEventData = z.infer<typeof ReportEventDataSchema>

export const SourcesDataSchema = z.object({
  files: z.array(z.object({ id: z.string(), filename: z.string(), mediaType: z.string(), sizeBytes: z.number() })),
})
export type SourcesData = z.infer<typeof SourcesDataSchema>

export const ErrorDataSchema = z.object({ stage: StageSchema, code: z.string(), message: z.string() })
export type ErrorData = z.infer<typeof ErrorDataSchema>

export const InterviewDataSchema = z.object({
  id: z.string().optional(),
  questionId: z.string().optional(),
  agentId: z.string(),
  agentName: z.string(),
  question: z.string(),
  status: z.enum(['pending', 'done', 'failed']),
  answer: z.string().optional(),
  error: z.string().optional(),
})
export type InterviewData = z.infer<typeof InterviewDataSchema>

export const InterviewWindowDataSchema = z.object({
  until: z.string().nullable(),
  personaCount: z.number().int(),
  closed: z.boolean(),
  reason: z.enum(['report_requested', 'expired', 'environment_stopped']).optional(),
})
export type InterviewWindowData = z.infer<typeof InterviewWindowDataSchema>

export const QueueDataSchema = z.object({ position: z.number().int().min(0) })
export type QueueData = z.infer<typeof QueueDataSchema>

export type OpinionsDataParts = {
  stage: StageData
  ontology: OntologyData
  graph: GraphData
  agents: AgentsData
  sim_feed: SimFeedData
  report_outline: ReportOutlineData
  report_event: ReportEventData
  sources: SourcesData
  error: ErrorData
  interview: InterviewData
  interview_window: InterviewWindowData
  queue: QueueData
}

export type OpinionsUIMessage = UIMessage<never, OpinionsDataParts>

export const stagePartId = (stage: Stage) => `stage:${stage}` as const
export const interviewPartId = (id: string) => `interview:${id}` as const
export { MAX_INTERVIEW_AGENTS } from './follow-up/keepalive'
