import { z } from 'zod'
import type {
  AgentsData,
  ErrorData,
  GraphData,
  InterviewData,
  InterviewWindowData,
  OntologyData,
  ReportEventData,
  ReportOutlineData,
  SimFeedData,
  SourcesData,
  StageData,
} from './parts'
import {
  AgentsDataSchema,
  ErrorDataSchema,
  GraphDataSchema,
  InterviewDataSchema,
  InterviewWindowDataSchema,
  interviewPartId,
  OntologyDataSchema,
  ReportEventDataSchema,
  ReportOutlineDataSchema,
  SimFeedDataSchema,
  SourcesDataSchema,
  STAGES,
  StageDataSchema,
  stagePartId,
} from './parts'

export const EVENT_KINDS = [
  'stage',
  'ontology',
  'graph',
  'agents',
  'sim_feed',
  'report_outline',
  'report_event',
  'sources',
  'report_text',
  'interview_window',
  'interview',
  'error',
  'done',
  'cancelled',
] as const
export type EventKind = (typeof EVENT_KINDS)[number]

export type RunEventInput = { kind: EventKind; partId: string | null; payload: unknown }

export type RunEventPayloads = {
  stage: StageData
  ontology: OntologyData
  graph: GraphData
  agents: AgentsData
  sim_feed: SimFeedData
  report_outline: ReportOutlineData
  report_event: ReportEventData
  sources: SourcesData
  report_text: { markdown: string }
  interview_window: InterviewWindowData
  interview: InterviewData
  error: ErrorData
  done: Record<string, never>
  cancelled: CancelledData
}

export const ReportTextDataSchema = z.object({ markdown: z.string() })
export const DoneDataSchema = z.object({})
export const CancelledDataSchema = z.object({ stage: z.enum(STAGES), message: z.string() })
export type CancelledData = z.infer<typeof CancelledDataSchema>

const SCHEMAS = {
  stage: StageDataSchema,
  ontology: OntologyDataSchema,
  graph: GraphDataSchema,
  agents: AgentsDataSchema,
  sim_feed: SimFeedDataSchema,
  report_outline: ReportOutlineDataSchema,
  report_event: ReportEventDataSchema,
  sources: SourcesDataSchema,
  report_text: ReportTextDataSchema,
  interview_window: InterviewWindowDataSchema,
  interview: InterviewDataSchema,
  error: ErrorDataSchema,
  done: DoneDataSchema,
  cancelled: CancelledDataSchema,
} as const

export const payloadSchemaFor = <K extends EventKind>(kind: K): (typeof SCHEMAS)[K] => SCHEMAS[kind]

export const partIdFor = <K extends EventKind>(kind: K, payload: RunEventPayloads[K] | unknown): string | null => {
  switch (kind) {
    case 'stage':
      return stagePartId((payload as StageData).stage)
    case 'report_event':
      return `report_event:${(payload as ReportEventData).n}`
    case 'report_text':
      return 'report'
    case 'interview':
      return interviewPartId((payload as InterviewData).id ?? (payload as InterviewData).agentId)
    case 'error':
    case 'done':
    case 'cancelled':
      return null
    default:
      return kind
  }
}
