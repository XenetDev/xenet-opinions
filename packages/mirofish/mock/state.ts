import { randomBytes } from 'node:crypto'

export type FailStage = 'graph_build' | 'sim_prepare' | 'sim_run' | 'report'

export class Timeline {
  readonly startedAt = Date.now()

  constructor(readonly durationMs: number) {}

  get elapsed() {
    return Date.now() - this.startedAt
  }

  get progress() {
    return this.durationMs <= 0 ? 1 : Math.min(1, this.elapsed / this.durationMs)
  }

  get done() {
    return this.elapsed >= this.durationMs
  }
}

export const hexId = (prefix: string) => `${prefix}_${randomBytes(6).toString('hex')}`

export type GraphTask = { id: string; projectId: string; graphId: string; timeline: Timeline }
export type PrepareTask = { id: string; simulationId: string; timeline: Timeline }
export type RunState = { maxRounds: number; timeline: Timeline; stopped: boolean }
export type SimulationRecord = {
  id: string
  projectId: string
  graphId: string
  prepare?: PrepareTask
  run?: RunState
}
export type ReportRecord = { id: string; simulationId: string; timeline: Timeline }

export const createStore = () => ({
  projects: new Map<string, { id: string; name: string; graphId?: string }>(),
  graphTasks: new Map<string, GraphTask>(),
  prepareTasks: new Map<string, PrepareTask>(),
  simulations: new Map<string, SimulationRecord>(),
  reports: new Map<string, ReportRecord>(),
})

export type Store = ReturnType<typeof createStore>
