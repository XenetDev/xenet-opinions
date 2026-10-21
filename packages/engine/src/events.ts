import { z } from 'zod'
import {
  AgentsDataSchema,
  ErrorDataSchema,
  GraphDataSchema,
  OntologyDataSchema,
  ReportEventDataSchema,
  ReportOutlineDataSchema,
  SimFeedDataSchema,
  SourcesDataSchema,
  StageDataSchema,
  stagePartId,
} from './parts'
import type {
  AgentsData,
  ErrorData,
  GraphData,
  OntologyData,
  ReportEventData,
  ReportOutlineData,
  SimFeedData,
  SourcesData,
  StageData,
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
  'error',
  'done',
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
  error: ErrorData
  done: Record<string, never>
}

export const ReportTextDataSchema = z.object({ markdown: z.string() })
export const DoneDataSchema = z.object({})

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
  error: ErrorDataSchema,
  done: DoneDataSchema,
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
    case 'error':
    case 'done':
      return null
    default:
      return kind
  }
}
