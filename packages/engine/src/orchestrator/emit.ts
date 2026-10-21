import type { Run } from '@xo/db'
import { MiroFishError } from '@xo/mirofish'
import { type EventKind, type RunEventInput, type RunEventPayloads, partIdFor } from '../events'
import type { Stage, StageData } from '../parts'
import type { Deps } from './types'

export const event = <K extends EventKind>(kind: K, payload: RunEventPayloads[K]): RunEventInput => ({
  kind,
  partId: partIdFor(kind, payload),
  payload,
})

export const emit = async <K extends EventKind>(deps: Deps, run: Run, kind: K, payload: RunEventPayloads[K]) => {
  await deps.store.appendEvent(run.id, event(kind, payload))
}

export const running = (deps: Deps, run: Run, stage: Stage, extra: Omit<StageData, 'stage' | 'status'> = {}) =>
  emit(deps, run, 'stage', { stage, status: 'running', ...extra })

export const advance = async (deps: Deps, run: Run, stage: Stage, next: Stage) => {
  await emit(deps, run, 'stage', { stage, status: 'done' })
  return deps.store.update(run.id, { stage: next })
}

export const need = <T>(value: T | undefined | null, what: string): T => {
  if (value === undefined || value === null) throw new Error(`Missing ${what}`)
  return value
}

export const remoteFailure = (message: string | null | undefined, fallback: string, path: string) =>
  new MiroFishError({ code: 'api', message: message || fallback, path })
