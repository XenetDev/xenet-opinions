import type { UIMessage } from 'ai'

export const STAGES = ['ontology', 'graph_build', 'sim_create', 'sim_prepare', 'sim_run', 'report', 'finished'] as const
export type Stage = (typeof STAGES)[number]

export type StageStatus = 'pending' | 'running' | 'done' | 'failed'

export type StageData = { stage: Stage; status: StageStatus; progress?: number; message?: string }

export type OpinionsDataParts = { stage: StageData }

export type OpinionsUIMessage = UIMessage<never, OpinionsDataParts>

export const stagePartId = (stage: Stage) => `stage:${stage}` as const
