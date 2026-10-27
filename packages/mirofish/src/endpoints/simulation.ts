import { z } from 'zod'
import type { Http, RequestInitOptions } from '../client'
import { type Platform, PlatformSchema } from '../schemas/common'
import {
  InterviewBatchResult,
  Posts,
  PrepareStarted,
  PrepareStatus,
  ProfilesRealtime,
  RunStatus,
  SimulationConfig,
  SimulationState,
  StartResult,
} from '../schemas/simulation'

const INTERVIEW_TIMEOUT_MS = 200_000

const sim = (id: string) => `/api/simulation/${encodeURIComponent(id)}`

export const simulationEndpoints = (http: Http) => ({
  create(input: { projectId: string; graphId?: string }, init?: RequestInitOptions) {
    return http.postJson(
      '/api/simulation/create',
      { project_id: input.projectId, graph_id: input.graphId, enable_twitter: true, enable_reddit: true },
      SimulationState,
      init,
    )
  },
  prepare(input: { simulationId: string }, init?: RequestInitOptions) {
    return http.postJson(
      '/api/simulation/prepare',
      { simulation_id: input.simulationId, use_llm_for_profiles: true, parallel_profile_count: 5 },
      PrepareStarted,
      init,
    )
  },
  prepareStatus(input: { simulationId?: string; taskId?: string }, init?: RequestInitOptions) {
    return http.postJson(
      '/api/simulation/prepare/status',
      { simulation_id: input.simulationId, task_id: input.taskId },
      PrepareStatus,
      init,
    )
  },
  async profilesRealtime(simulationId: string, platform?: Platform, init?: RequestInitOptions) {
    const query = platform === undefined ? undefined : { platform: PlatformSchema.parse(platform) }
    return http.getJson(`${sim(simulationId)}/profiles/realtime`, ProfilesRealtime, { ...init, query })
  },
  configRealtime(simulationId: string, init?: RequestInitOptions) {
    return http.getJson(`${sim(simulationId)}/config/realtime`, SimulationConfig, init)
  },
  start(input: { simulationId: string; maxRounds?: number }, init?: RequestInitOptions) {
    return http.postJson(
      '/api/simulation/start',
      {
        simulation_id: input.simulationId,
        platform: 'parallel',
        max_rounds: input.maxRounds,
        force: true,
        enable_graph_memory_update: true,
      },
      StartResult,
      init,
    )
  },
  runStatus(simulationId: string, init?: RequestInitOptions) {
    return http.getJson(`${sim(simulationId)}/run-status`, RunStatus, init)
  },
  async posts(
    simulationId: string,
    q: { platform: Platform; limit?: number; offset?: number },
    init?: RequestInitOptions,
  ) {
    const query = { platform: PlatformSchema.parse(q.platform), limit: q.limit, offset: q.offset }
    return http.getJson(`${sim(simulationId)}/posts`, Posts, { ...init, query })
  },
  stop(simulationId: string, init?: RequestInitOptions) {
    return http.postJson('/api/simulation/stop', { simulation_id: simulationId }, z.unknown(), init)
  },
  closeEnv(simulationId: string, init?: RequestInitOptions) {
    return http.postJson('/api/simulation/close-env', { simulation_id: simulationId }, z.unknown(), init)
  },
  interviewBatch(
    input: {
      simulationId: string
      interviews: Array<{ agentId: number | string; prompt: string; platform?: Platform }>
      platform?: Platform
      timeout?: number
    },
    init?: RequestInitOptions,
  ) {
    return http.postJson(
      '/api/simulation/interview/batch',
      {
        simulation_id: input.simulationId,
        interviews: input.interviews.map((i) => ({ agent_id: i.agentId, prompt: i.prompt, platform: i.platform })),
        platform: input.platform,
        timeout: input.timeout,
      },
      InterviewBatchResult,
      { ...init, timeoutMs: init?.timeoutMs ?? INTERVIEW_TIMEOUT_MS },
    )
  },
})
