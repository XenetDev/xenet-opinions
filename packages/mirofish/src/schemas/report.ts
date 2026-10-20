import { z } from 'zod'

export const ReportStarted = z
  .object({
    simulation_id: z.string(),
    report_id: z.string(),
    task_id: z.string().optional(),
    status: z.string().optional(),
    already_generated: z.boolean().optional(),
  })
  .loose()
export type ReportStarted = z.infer<typeof ReportStarted>

export const Report = z
  .object({
    report_id: z.string(),
    simulation_id: z.string(),
    status: z.enum(['pending', 'planning', 'generating', 'completed', 'failed']),
    outline: z.unknown().optional(),
    markdown_content: z.string().nullish(),
    error: z.string().nullish(),
  })
  .loose()
export type Report = z.infer<typeof Report>

export const AgentLogLine = z
  .object({
    timestamp: z.string().optional(),
    elapsed_seconds: z.number().optional(),
    action: z.string(),
    stage: z.string().optional(),
    section_title: z.string().optional(),
    section_index: z.number().optional(),
    details: z.unknown().optional(),
  })
  .loose()
export type AgentLogLine = z.infer<typeof AgentLogLine>

export const AgentLogPage = z
  .object({
    logs: z.array(AgentLogLine),
    total_lines: z.number(),
    from_line: z.number(),
    has_more: z.boolean(),
  })
  .loose()
export type AgentLogPage = z.infer<typeof AgentLogPage>

export const ChatResponse = z
  .object({
    response: z.string(),
    tool_calls: z.array(z.unknown()).optional(),
    sources: z.array(z.unknown()).optional(),
  })
  .loose()
export type ChatResponse = z.infer<typeof ChatResponse>
