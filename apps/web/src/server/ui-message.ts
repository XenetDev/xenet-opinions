import { z } from 'zod'
import type { Message } from '@xo/db'
import {
  AgentsDataSchema,
  ErrorDataSchema,
  GraphDataSchema,
  InterviewDataSchema,
  OntologyDataSchema,
  QueueDataSchema,
  ReportEventDataSchema,
  ReportOutlineDataSchema,
  SimFeedDataSchema,
  SourcesDataSchema,
  StageDataSchema,
  type OpinionsUIMessage,
} from '@xo/engine/parts'

const rowSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  parts: z.array(z.unknown()),
})

const textPartSchema = z.object({ type: z.literal('text'), text: z.string() }).passthrough()

const dataSchemas: Record<string, z.ZodType> = {
  'data-stage': StageDataSchema,
  'data-ontology': OntologyDataSchema,
  'data-graph': GraphDataSchema,
  'data-agents': AgentsDataSchema,
  'data-sim_feed': SimFeedDataSchema,
  'data-report_outline': ReportOutlineDataSchema,
  'data-report_event': ReportEventDataSchema,
  'data-sources': SourcesDataSchema,
  'data-error': ErrorDataSchema,
  'data-interview': InterviewDataSchema,
  'data-queue': QueueDataSchema,
}

function validPart(part: unknown, rowId: string): boolean {
  const type = z.object({ type: z.string() }).safeParse(part)
  if (!type.success) {
    console.error('Dropping malformed part', rowId)
    return false
  }
  if (type.data.type === 'text') {
    const ok = textPartSchema.safeParse(part).success
    if (!ok) console.error('Dropping invalid text part', rowId)
    return ok
  }
  const schema = dataSchemas[type.data.type]
  if (!schema) {
    console.error('Dropping unknown part type', rowId, type.data.type)
    return false
  }
  const data = (part as { data?: unknown }).data
  const parsed = schema.safeParse(data)
  if (!parsed.success) console.error('Dropping invalid part', rowId, type.data.type, parsed.error.message)
  return parsed.success
}

export function toUIMessages(rows: Message[]): OpinionsUIMessage[] {
  return rows.flatMap((row) => {
    const parsed = rowSchema.safeParse(row)
    if (!parsed.success) {
      console.error('Dropping invalid message row', row.id, parsed.error.message)
      return []
    }
    const parts = parsed.data.parts.filter((part) => validPart(part, row.id))
    return [{ ...parsed.data, parts } as OpinionsUIMessage]
  })
}
