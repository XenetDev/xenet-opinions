import { schema, type Db, type Run } from '@xo/db'
import { and, asc, desc, eq, gt, inArray, isNotNull, lte, or, sql } from 'drizzle-orm'
import { payloadSchemaFor, type RunEventInput } from '../events'
import { type Fence, FenceError, type RunPatch, type RunStore } from './types'

const { runs, runEvents, messages, uploads } = schema

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

const fenced = (id: string, fence?: Fence) =>
  fence ? and(eq(runs.id, id), eq(runs.status, 'running'), eq(runs.leaseOwner, fence.owner)) : eq(runs.id, id)

const lockRun = async (tx: Tx, id: string, fence?: Fence) => {
  const [current] = await tx.select().from(runs).where(fenced(id, fence)).for('update')
  if (current) return current
  if (fence) throw new FenceError(id)
  throw new Error('run_not_found')
}

const applyPatch = async (tx: Tx, current: Run, patch: RunPatch, fence?: Fence) => {
  const { ids, cursors, ...rest } = patch
  const set: Partial<Run> = { ...rest }
  if (ids) set.ids = { ...current.ids, ...ids }
  if (cursors) set.cursors = { ...current.cursors, ...cursors }
  if (Object.keys(set).length === 0) return current
  const [row] = await tx.update(runs).set(set).where(fenced(current.id, fence)).returning()
  if (!row) throw new FenceError(current.id)
  return row
}

const validate = (events: RunEventInput[]) => events.map((e) => ({ ...e, payload: payloadSchemaFor(e.kind).parse(e.payload) }))

const insertEvents = async (tx: Tx, runId: string, events: RunEventInput[]) => {
  const [max] = await tx
    .select({ seq: sql<number>`coalesce(max(${runEvents.seq}), 0)::int` })
    .from(runEvents)
    .where(eq(runEvents.runId, runId))
  const base = max?.seq ?? 0
  if (events.length === 0) return []
  return tx
    .insert(runEvents)
    .values(events.map((e, i) => ({ runId, seq: base + i + 1, kind: e.kind, partId: e.partId, payload: e.payload })))
    .returning()
}

export function createDrizzleStore(db: Db): RunStore {
  return {
    async create(input) {
      const [row] = await db
        .insert(runs)
        .values({
          id: crypto.randomUUID(),
          chatId: input.chatId,
          userId: input.userId,
          assistantMessageId: input.assistantMessageId,
          config: input.config,
        })
        .returning()
      return row!
    },
    async get(id) {
      const [row] = await db.select().from(runs).where(eq(runs.id, id))
      return row ?? null
    },
    async getActiveByChat(chatId) {
      const [row] = await db
        .select()
        .from(runs)
        .where(and(eq(runs.chatId, chatId), inArray(runs.status, ['queued', 'running'])))
        .limit(1)
      return row ?? null
    },
    async getLatestByChat(chatId) {
      const [row] = await db.select().from(runs).where(eq(runs.chatId, chatId)).orderBy(desc(runs.queuedAt)).limit(1)
      return row ?? null
    },
    async claimNext(owner, leaseMs, maxConcurrent) {
      return db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(7_241_001)`)
        const [live] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(runs)
          .where(and(eq(runs.status, 'running'), sql`${runs.leaseUntil} >= now()`))
        if ((live?.n ?? 0) >= maxConcurrent) return null
        const [next] = await tx
          .select()
          .from(runs)
          .where(or(eq(runs.status, 'queued'), and(eq(runs.status, 'running'), sql`${runs.leaseUntil} < now()`)))
          .orderBy(asc(runs.queuedAt))
          .limit(1)
          .for('update', { skipLocked: true })
        if (!next) return null
        const [claimed] = await tx
          .update(runs)
          .set({
            status: 'running',
            leaseOwner: owner,
            leaseUntil: sql`now() + ${leaseMs} * interval '1 millisecond'`,
            startedAt: sql`coalesce(${runs.startedAt}, now())`,
            attempt: sql`${runs.attempt} + 1`,
          })
          .where(eq(runs.id, next.id))
          .returning()
        return claimed ?? null
      })
    },
    async renewLease(id, owner, leaseMs) {
      const rows = await db
        .update(runs)
        .set({ leaseUntil: sql`now() + ${leaseMs} * interval '1 millisecond'` })
        .where(and(eq(runs.id, id), eq(runs.leaseOwner, owner), eq(runs.status, 'running')))
        .returning({ id: runs.id })
      return rows.length > 0
    },
    async releaseLease(id, owner) {
      const rows = await db
        .update(runs)
        .set({ leaseUntil: sql`now()` })
        .where(and(eq(runs.id, id), eq(runs.leaseOwner, owner), eq(runs.status, 'running')))
        .returning({ id: runs.id })
      return rows.length > 0
    },
    async update(id, patch, fence) {
      return db.transaction(async (tx) => applyPatch(tx, await lockRun(tx, id, fence), patch, fence))
    },
    async transition(id, patch, events, fence, opts) {
      const valid = validate(events)
      return db.transaction(async (tx) => {
        const current = await lockRun(tx, id, fence)
        if (opts?.expectStatus && !opts.expectStatus.includes(current.status)) throw new Error('run_not_active')
        await insertEvents(tx, id, valid)
        return applyPatch(tx, current, patch, fence)
      })
    },
    async appendEvent(runId, event, fence) {
      const [valid] = validate([event])
      return db.transaction(async (tx) => {
        await lockRun(tx, runId, fence)
        const [row] = await insertEvents(tx, runId, [valid!])
        return row!
      })
    },
    async listEvents(runId, afterSeq) {
      return db
        .select()
        .from(runEvents)
        .where(and(eq(runEvents.runId, runId), gt(runEvents.seq, afterSeq)))
        .orderBy(asc(runEvents.seq))
    },
    async lastSeq(runId) {
      const [row] = await db
        .select({ seq: sql<number>`coalesce(max(${runEvents.seq}), 0)::int` })
        .from(runEvents)
        .where(eq(runEvents.runId, runId))
      return row?.seq ?? 0
    },
    async setMessageParts(messageId, parts) {
      await db.update(messages).set({ parts }).where(eq(messages.id, messageId))
    },
    async listEnvsToSweep(now, limit = 50) {
      return db
        .select()
        .from(runs)
        .where(and(eq(runs.envState, 'open'), isNotNull(runs.envKeepaliveUntil), lte(runs.envKeepaliveUntil, now)))
        .orderBy(asc(runs.envKeepaliveUntil))
        .limit(limit)
    },
    async closeEnv(id) {
      const rows = await db
        .update(runs)
        .set({ envState: 'closed' })
        .where(and(eq(runs.id, id), eq(runs.envState, 'open')))
        .returning({ id: runs.id })
      return rows.length > 0
    },
    async listUploads(ids) {
      if (ids.length === 0) return []
      const rows = await db.select().from(uploads).where(inArray(uploads.id, ids))
      const byId = new Map(rows.map((r) => [r.id, r]))
      return ids.flatMap((id) => byId.get(id) ?? [])
    },
  }
}
