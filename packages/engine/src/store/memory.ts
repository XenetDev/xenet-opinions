import type { Interview, Run, RunEvent, Upload } from '@xo/db'
import { payloadSchemaFor, type RunEventInput } from '../events'
import { type Fence, FenceError, type RunPatch, type RunStore } from './types'

const ACTIVE = ['queued', 'running']

export function createMemoryStore(): RunStore & {
  runs: Map<string, Run>
  events: Map<string, RunEvent[]>
  parts: Map<string, unknown[]>
  uploads: Map<string, Upload>
  interviews: Map<string, Interview>
} {
  const runs = new Map<string, Run>()
  const events = new Map<string, RunEvent[]>()
  const parts = new Map<string, unknown[]>()
  const uploads = new Map<string, Upload>()
  const interviews = new Map<string, Interview>()
  let eventId = 0
  const order = new Map<string, number>()
  let counter = 0

  const mustGet = (id: string, fence?: Fence): Run => {
    const run = runs.get(id)
    if (!run) throw fence ? new FenceError(id) : new Error('run_not_found')
    if (fence && (run.status !== 'running' || run.leaseOwner !== fence.owner)) throw new FenceError(id)
    return run
  }
  const applyPatch = (run: Run, patch: RunPatch): Run => {
    const { ids, cursors, ...rest } = patch
    const next: Run = {
      ...run,
      ...rest,
      ids: ids ? { ...run.ids, ...ids } : run.ids,
      cursors: cursors ? { ...run.cursors, ...cursors } : run.cursors,
    }
    runs.set(run.id, next)
    return next
  }
  const validate = (input: RunEventInput[]) =>
    input.map((e) => ({ ...e, payload: payloadSchemaFor(e.kind).parse(e.payload) }))
  const appendRows = (runId: string, input: RunEventInput[]) => {
    const list = events.get(runId) ?? []
    const rows = input.map(
      (e, i): RunEvent => ({
        id: ++eventId,
        runId,
        seq: (list.at(-1)?.seq ?? 0) + i + 1,
        kind: e.kind,
        partId: e.partId,
        payload: e.payload,
        createdAt: new Date(),
      }),
    )
    events.set(runId, [...list, ...rows])
    return rows
  }
  const byQueuedAt = (a: Run, b: Run) =>
    a.queuedAt.getTime() - b.queuedAt.getTime() || order.get(a.id)! - order.get(b.id)!

  return {
    runs,
    events,
    parts,
    uploads,
    interviews,
    async create(input) {
      for (const r of runs.values()) {
        if (r.chatId === input.chatId && ACTIVE.includes(r.status)) throw new Error('runs_one_active_per_chat')
      }
      const run: Run = {
        id: crypto.randomUUID(),
        chatId: input.chatId,
        userId: input.userId,
        assistantMessageId: input.assistantMessageId,
        retryOf: null,
        status: 'queued',
        stage: 'ontology',
        config: input.config,
        ids: {},
        cursors: {},
        error: null,
        attempt: 0,
        leaseOwner: null,
        leaseUntil: null,
        envState: 'none',
        envKeepaliveUntil: null,
        queuedAt: new Date(),
        startedAt: null,
        finishedAt: null,
      }
      order.set(run.id, counter++)
      runs.set(run.id, run)
      return run
    },
    async get(id) {
      return runs.get(id) ?? null
    },
    async getActiveByChat(chatId) {
      return [...runs.values()].find((r) => r.chatId === chatId && ACTIVE.includes(r.status)) ?? null
    },
    async getLatestByChat(chatId) {
      return [...runs.values()].filter((r) => r.chatId === chatId).sort((a, b) => byQueuedAt(b, a))[0] ?? null
    },
    async queuePosition(runId) {
      const run = runs.get(runId)
      if (run?.status !== 'queued') return null
      return (
        1 +
        [...runs.values()].filter((r) => ACTIVE.includes(r.status) && r.queuedAt.getTime() < run.queuedAt.getTime())
          .length
      )
    },
    async hasPausedRunning() {
      return [...runs.values()].some((r) => r.status === 'running' && r.stage === 'interviews')
    },
    async claimNext(owner, leaseMs, maxConcurrent) {
      const now = Date.now()
      const live = [...runs.values()].filter(
        (r) => r.status === 'running' && r.leaseUntil && r.leaseUntil.getTime() >= now,
      ).length
      if (live >= maxConcurrent) return null
      const next = [...runs.values()]
        .filter(
          (r) => r.status === 'queued' || (r.status === 'running' && r.leaseUntil && r.leaseUntil.getTime() < now),
        )
        .sort(byQueuedAt)[0]
      if (!next) return null
      const claimed: Run = {
        ...next,
        status: 'running',
        leaseOwner: owner,
        leaseUntil: new Date(now + leaseMs),
        startedAt: next.startedAt ?? new Date(now),
        attempt: next.attempt + 1,
      }
      runs.set(claimed.id, claimed)
      return claimed
    },
    async renewLease(id, owner, leaseMs) {
      const run = runs.get(id)
      if (run?.status !== 'running' || run.leaseOwner !== owner) return false
      runs.set(id, { ...run, leaseUntil: new Date(Date.now() + leaseMs) })
      return true
    },
    async releaseLease(id, owner) {
      const run = runs.get(id)
      if (run?.status !== 'running' || run.leaseOwner !== owner) return false
      runs.set(id, { ...run, leaseUntil: new Date(Date.now() - 1) })
      return true
    },
    async update(id, patch, fence) {
      return applyPatch(mustGet(id, fence), patch)
    },
    async transition(id, patch, input, fence, opts) {
      const run = mustGet(id, fence)
      if (opts?.expectStatus && !opts.expectStatus.includes(run.status)) throw new Error('run_not_active')
      if (opts?.expect && !opts.expect(run)) throw new Error('run_not_active')
      const valid = validate(input)
      appendRows(id, valid)
      return applyPatch(run, typeof patch === 'function' ? patch(run) : patch)
    },
    async appendEvent(runId, event, fence) {
      mustGet(runId, fence)
      return appendRows(runId, validate([event]))[0]!
    },
    async lastSeq(runId) {
      return events.get(runId)?.at(-1)?.seq ?? 0
    },
    async listEvents(runId, afterSeq) {
      return (events.get(runId) ?? []).filter((e) => e.seq > afterSeq)
    },
    async setMessageParts(messageId, value) {
      parts.set(messageId, value)
    },
    async listEnvsToSweep(now, limit = 50) {
      return [...runs.values()]
        .filter(
          (r) =>
            r.status === 'done' &&
            r.envState === 'open' &&
            r.envKeepaliveUntil &&
            r.envKeepaliveUntil.getTime() <= now.getTime(),
        )
        .sort((a, b) => a.envKeepaliveUntil!.getTime() - b.envKeepaliveUntil!.getTime())
        .slice(0, limit)
    },
    async closeEnv(id) {
      const run = runs.get(id)
      if (run?.envState !== 'open') return false
      runs.set(id, { ...run, envState: 'closed' })
      return true
    },
    async listUploads(ids) {
      return ids.flatMap((id) => uploads.get(id) ?? [])
    },
    async listPendingInterviews(runId) {
      return [...interviews.values()]
        .filter((i) => i.runId === runId && i.status === 'pending')
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
    },
    async updateInterview(id, patch) {
      const row = interviews.get(id)
      if (!row) return
      interviews.set(id, {
        ...row,
        status: patch.status,
        ...(patch.answer !== undefined ? { answer: patch.answer } : {}),
      })
    },
    async createInterviews(rows) {
      return rows.map((input) => {
        const row: Interview = {
          ...input,
          questionId: input.questionId ?? null,
          answer: input.answer ?? null,
          createdAt: input.createdAt ?? new Date(),
        }
        interviews.set(row.id, row)
        return row
      })
    },
  }
}
