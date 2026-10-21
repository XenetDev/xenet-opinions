import type { Run } from '@xo/db'
import type { MiroFishClient } from '@xo/mirofish'
import type { Storage } from '@xo/storage'
import type { Stage } from '../parts'
import type { RunStore } from '../store/types'

export type Deps = {
  store: RunStore
  mirofish: MiroFishClient
  storage: Storage
  now(): Date
  sleep(ms: number): Promise<void>
  log(msg: string, meta?: Record<string, unknown>): void
  fence?: { owner: string }
}

export type ActiveStage = Exclude<Stage, 'finished'>

export type StageHandler = {
  stage: ActiveStage
  hasEntered(run: Run): boolean
  enter(run: Run, deps: Deps): Promise<Run>
  poll(run: Run, deps: Deps): Promise<Run>
}
