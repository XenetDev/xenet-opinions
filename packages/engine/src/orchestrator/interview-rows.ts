import type { Interview } from '@xo/db'
import type { RunEventInput } from '../events'
import type { RunStore } from '../store/types'
import { event } from './emit'

export const OFFLINE = 'Agents are offline'

export const interviewOf = (row: Interview) => ({
  id: row.id,
  questionId: row.questionId ?? row.id,
  agentId: row.agentId,
  agentName: row.agentName,
  question: row.question,
})

export async function offlineInterviews(
  store: RunStore,
  runId: string,
): Promise<{ events: RunEventInput[]; settle: () => Promise<void> }> {
  const rows = await store.listPendingInterviews(runId)
  return {
    events: rows.map((row) => event('interview', { ...interviewOf(row), status: 'failed', error: OFFLINE })),
    settle: async () => {
      for (const row of rows) await store.updateInterview(row.id, { status: 'failed' })
    },
  }
}
