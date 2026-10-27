import type { InterviewBatchResult } from '@xo/mirofish'
import type { InterviewData } from '../parts'

export type RequestedInterview = { agentId: string; agentName: string; question: string }

export const mirofishAgentId = (id: string): number | string => (/^\d+$/.test(id) ? Number(id) : id)

export const pendingInterviewParts = (requested: RequestedInterview[]): InterviewData[] =>
  requested.map((r) => ({ ...r, status: 'pending' }))

export const interviewsToParts = (result: InterviewBatchResult, requested: RequestedInterview[]): InterviewData[] => {
  const byAgent = new Map<string, string>()
  for (const entry of Object.values(result.result?.results ?? {})) {
    const id = String(entry.agent_id)
    if (entry.response !== undefined && !byAgent.has(id)) byAgent.set(id, entry.response)
  }
  return requested.map((r) => {
    const answer = byAgent.get(r.agentId)
    if (answer !== undefined) return { ...r, status: 'done', answer }
    return { ...r, status: 'failed', error: 'No answer' }
  })
}
