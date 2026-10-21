import type { Run, RunConfig, RunEvent, Upload } from '@xo/db'
import type { RunEventInput } from '../events'

export type RunPatch = Partial<
  Pick<Run, 'status' | 'stage' | 'ids' | 'cursors' | 'error' | 'attempt' | 'envState' | 'envKeepaliveUntil' | 'startedAt' | 'finishedAt' | 'leaseUntil'>
>

export type Fence = { owner: string }

export type TransitionOpts = { expectStatus?: Run['status'][] }

export class FenceError extends Error {
  readonly code = 'run_fenced'
  constructor(runId: string) {
    super(`Run ${runId} is no longer owned by this worker`)
    this.name = 'FenceError'
  }
}

export type RunStore = {
  create(input: { chatId: string; userId: string; assistantMessageId: string; config: RunConfig }): Promise<Run>
  get(id: string): Promise<Run | null>
  getActiveByChat(chatId: string): Promise<Run | null>
  getLatestByChat(chatId: string): Promise<Run | null>
  claimNext(owner: string, leaseMs: number, maxConcurrent: number): Promise<Run | null>
  renewLease(id: string, owner: string, leaseMs: number): Promise<boolean>
  releaseLease(id: string, owner: string): Promise<boolean>
  update(id: string, patch: RunPatch, fence?: Fence): Promise<Run>
  transition(id: string, patch: RunPatch, events: RunEventInput[], fence?: Fence, opts?: TransitionOpts): Promise<Run>
  appendEvent(runId: string, event: RunEventInput, fence?: Fence): Promise<RunEvent>
  listEvents(runId: string, afterSeq: number): Promise<RunEvent[]>
  lastSeq(runId: string): Promise<number>
  setMessageParts(messageId: string, parts: unknown[]): Promise<void>
  listUploads(ids: string[]): Promise<Upload[]>
}
