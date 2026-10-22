import type { InterviewBatchResult } from '@xo/mirofish'
import type { InterviewData } from '../parts'

export type RequestedInterview = { agentId: string; agentName: string; question: string }

export const mirofishAgentId = (id: string): number | string => (/^\d+$/.test(id) ? Number(id) : id)

export const pendingInterviewParts = (requested: RequestedInterview[]): InterviewData[] =>
  requested.map((r) => ({ ...r, status: 'pending' }))

export const interviewsToParts = (result: InterviewBatchResult, requested: RequestedInterview[]): InterviewData[] => {
  const byAgent = new Map((result.results ?? []).map((r) => [String(r.agent_id), r]))
  return requested.map((r) => {
    const hit = byAgent.get(r.agentId)
    if (hit?.response !== undefined) return { ...r, status: 'done', answer: hit.response }
    return { ...r, status: 'failed', error: 'No answer' }
  })
}
