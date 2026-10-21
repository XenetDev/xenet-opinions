import type { Run, RunConfig, RunEvent, Upload } from '@xo/db'
import type { RunEventInput } from '../events'

export type RunPatch = Partial<
  Pick<Run, 'status' | 'stage' | 'ids' | 'cursors' | 'error' | 'attempt' | 'envState' | 'envKeepaliveUntil' | 'startedAt' | 'finishedAt'>
>

export type RunStore = {
  create(input: { chatId: string; userId: string; assistantMessageId: string; config: RunConfig }): Promise<Run>
  get(id: string): Promise<Run | null>
  getActiveByChat(chatId: string): Promise<Run | null>
  getLatestByChat(chatId: string): Promise<Run | null>
  claimNext(owner: string, leaseMs: number, maxConcurrent: number): Promise<Run | null>
  renewLease(id: string, owner: string, leaseMs: number): Promise<boolean>
  update(id: string, patch: RunPatch): Promise<Run>
  transition(id: string, patch: RunPatch, events: RunEventInput[]): Promise<Run>
  appendEvent(runId: string, event: RunEventInput): Promise<RunEvent>
  listEvents(runId: string, afterSeq: number): Promise<RunEvent[]>
  setMessageParts(messageId: string, parts: unknown[]): Promise<void>
  listUploads(ids: string[]): Promise<Upload[]>
}
