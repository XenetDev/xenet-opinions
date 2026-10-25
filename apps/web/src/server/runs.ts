import { type Run, schema } from '@xo/db'
import { cancelRun, createDrizzleStore, materialiseRun } from '@xo/engine'
import { generateId } from 'ai'
import { and, count, eq, gte, inArray, isNull, min, sql } from 'drizzle-orm'
import { db } from '@/lib/db'

const { chats, messages, runs, uploads } = schema

export const runStore = createDrizzleStore(db)

export class RunActiveError extends Error {
  constructor() {
    super('run_active')
    this.name = 'RunActiveError'
  }
}

export class RunNotActiveError extends Error {
  constructor() {
    super('run_not_active')
    this.name = 'RunNotActiveError'
  }
}

export class RunNotFoundError extends Error {
  constructor() {
    super('run_not_found')
    this.name = 'RunNotFoundError'
  }
}

export class RunNotFailedError extends Error {
  constructor() {
    super('run_not_failed')
    this.name = 'RunNotFailedError'
  }
}

export function isActiveRunViolation(error: unknown): boolean {
  for (
    let current = error as { message?: string; cause?: unknown } | undefined, depth = 0;
    current && depth < 4;
    depth++
  ) {
    if (typeof current.message === 'string' && current.message.includes('runs_one_active_per_chat')) return true
    current = current.cause as typeof current
  }
  return false
}

export async function countOwnedUploads(input: {
  chatId: string
  userId: string
  uploadIds: string[]
}): Promise<number> {
  if (input.uploadIds.length === 0) return 0
  const [row] = await db
    .select({ n: count() })
    .from(uploads)
    .where(
      and(inArray(uploads.id, input.uploadIds), eq(uploads.chatId, input.chatId), eq(uploads.userId, input.userId)),
    )
  return row?.n ?? 0
}

export async function runsStartedSince(
  userId: string,
  since: Date,
): Promise<{ count: number; oldestQueuedAt: Date | null }> {
  const [row] = await db
    .select({ n: count(), oldest: min(runs.queuedAt) })
    .from(runs)
    .where(and(eq(runs.userId, userId), gte(runs.queuedAt, since), isNull(runs.retryOf)))
  return { count: row?.n ?? 0, oldestQueuedAt: row?.oldest ?? null }
}

export async function startRun(input: {
  chatId: string
  userId: string
  message: { id: string; parts: unknown[] }
  text: string
  uploadIds: string[]
  maxRounds: number
}): Promise<{ run: Run; assistantMessageId: string }> {
  const assistantMessageId = generateId()
  try {
    const run = await db.transaction(async (tx) => {
      await tx
        .insert(messages)
        .values({ id: input.message.id, chatId: input.chatId, role: 'user', parts: input.message.parts })
        .onConflictDoNothing()
      await tx.insert(messages).values({
        id: assistantMessageId,
        chatId: input.chatId,
        role: 'assistant',
        parts: [],
        createdAt: sql`now() + interval '1 millisecond'`,
      })
      const [row] = await tx
        .insert(runs)
        .values({
          id: crypto.randomUUID(),
          chatId: input.chatId,
          userId: input.userId,
          assistantMessageId,
          status: 'queued',
          config: { requirement: input.text, maxRounds: input.maxRounds, uploadIds: input.uploadIds },
        })
        .returning()
      await tx
        .update(chats)
        .set({
          title: sql`case when ${chats.title} = '' then ${input.text.slice(0, 60)} else ${chats.title} end`,
          updatedAt: sql`now()`,
        })
        .where(eq(chats.id, input.chatId))
      return row!
    })
    return { run, assistantMessageId }
  } catch (error) {
    if (isActiveRunViolation(error)) throw new RunActiveError()
    throw error
  }
}

export async function cancelActiveRun(chatId: string): Promise<Run> {
  const run = await runStore.getActiveByChat(chatId)
  if (!run) {
    if (!(await runStore.getLatestByChat(chatId))) throw new RunNotFoundError()
    throw new RunNotActiveError()
  }
  let cancelled: Run
  try {
    cancelled = await cancelRun(runStore, run.id, new Date())
  } catch (error) {
    if (error instanceof Error && error.message === 'run_not_active') throw new RunNotActiveError()
    throw error
  }
  try {
    await materialiseRun(runStore, run.id)
  } catch (error) {
    console.error('materialise after cancel failed', { runId: run.id, error })
  }
  return cancelled
}
