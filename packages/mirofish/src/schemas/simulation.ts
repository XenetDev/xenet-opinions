import { z } from 'zod'
import { Task } from './graph'

export const SimulationState = z
  .object({
    simulation_id: z.string(),
    project_id: z.string().optional(),
    graph_id: z.string().optional(),
    status: z.string().optional(),
  })
  .loose()
export type SimulationState = z.infer<typeof SimulationState>

export const PrepareStarted = z
  .object({
    simulation_id: z.string(),
    task_id: z.string().optional(),
    status: z.string().optional(),
    expected_entities_count: z.number().optional(),
    already_prepared: z.boolean().optional(),
  })
  .loose()
export type PrepareStarted = z.infer<typeof PrepareStarted>

export const StartResult = z
  .object({ simulation_id: z.string().optional(), runner_status: z.string().optional() })
  .loose()
export type StartResult = z.infer<typeof StartResult>

export const PrepareStatus = Task.extend({
  task_id: z.string().optional(),
  status: z.enum([...Task.shape.status.options, 'ready', 'not_started']),
  already_prepared: z.boolean().optional(),
}).loose()
export type PrepareStatus = z.infer<typeof PrepareStatus>

export const ProfilesRealtime = z
  .object({
    profiles: z.array(z.unknown()),
    is_generating: z.boolean().optional(),
    total_expected: z.number().optional(),
  })
  .loose()
export type ProfilesRealtime = z.infer<typeof ProfilesRealtime>

export const RunStatus = z
  .object({
    runner_status: z.enum(['idle', 'starting', 'running', 'paused', 'stopping', 'stopped', 'completed', 'failed']),
    current_round: z.number().optional(),
    total_rounds: z.number().optional(),
    progress_percent: z.number().optional(),
    total_actions_count: z.number().optional(),
    twitter_completed: z.boolean().optional(),
    reddit_completed: z.boolean().optional(),
    error: z.string().nullish(),
  })
  .loose()
export type RunStatus = z.infer<typeof RunStatus>

export const Posts = z.object({}).loose()
export type Posts = z.infer<typeof Posts>

export const InterviewEntry = z
  .object({
    agent_id: z.union([z.number(), z.string()]),
    platform: z.string().optional(),
    response: z.string().optional(),
    error: z.string().nullish(),
  })
  .loose()
export type InterviewEntry = z.infer<typeof InterviewEntry>

export const InterviewBatchResult = z
  .object({
    interviews_count: z.number().optional(),
    result: z
      .object({ interviews_count: z.number().optional(), results: z.record(z.string(), InterviewEntry).optional() })
      .loose()
      .optional(),
    timestamp: z.string().optional(),
  })
  .loose()
export type InterviewBatchResult = z.infer<typeof InterviewBatchResult>
