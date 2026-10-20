import type { Http, RequestInitOptions } from '../client'
import { AgentLogPage, ChatResponse, Report, ReportStarted } from '../schemas/report'

const CHAT_TIMEOUT_MS = 180_000

export const reportEndpoints = (http: Http) => ({
  generate(input: { simulationId: string; forceRegenerate?: boolean }, init?: RequestInitOptions) {
    return http.postJson(
      '/api/report/generate',
      { simulation_id: input.simulationId, force_regenerate: input.forceRegenerate },
      ReportStarted,
      init,
    )
  },
  get(reportId: string, init?: RequestInitOptions) {
    return http.getJson(`/api/report/${encodeURIComponent(reportId)}`, Report, init)
  },
  agentLog(reportId: string, fromLine: number, init?: RequestInitOptions) {
    return http.getJson(`/api/report/${encodeURIComponent(reportId)}/agent-log`, AgentLogPage, {
      ...init,
      query: { from_line: fromLine },
    })
  },
  chat(
    input: { simulationId: string; message: string; history: Array<{ role: 'user' | 'assistant'; content: string }> },
    init?: RequestInitOptions,
  ) {
    return http.postJson(
      '/api/report/chat',
      { simulation_id: input.simulationId, message: input.message, chat_history: input.history },
      ChatResponse,
      { ...init, timeoutMs: init?.timeoutMs ?? CHAT_TIMEOUT_MS },
    )
  },
})
