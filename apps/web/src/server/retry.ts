import { asc, desc, eq, sql } from 'drizzle-orm'
import { generateId } from 'ai'
import { schema, type Run } from '@xo/db'
import { EVENT_KINDS, partIdFor, payloadSchemaFor, prepareRetry, type EventKind, type StageData } from '@xo/engine'
import { db } from '@/lib/db'
import { RunActiveError, RunNotFailedError, isActiveRunViolation } from './runs'

const { chats, messages, runEvents, runs } = schema

const SKIPPED_KINDS = new Set(['error', 'done', 'cancelled'])

export async function retryRun(input: { chatId: string; userId: string }): Promise<{ run: Run; assistantMessageId: string }> {
  const assistantMessageId = generateId()
  try {
    const run = await db.transaction(async (tx) => {
      const [old] = await tx
        .select()
        .from(runs)
        .where(eq(runs.chatId, input.chatId))
        .orderBy(desc(runs.queuedAt))
        .limit(1)
        .for('update')
      if (old && (old.status === 'queued' || old.status === 'running')) throw new RunActiveError()
      if (!old || old.status !== 'failed') throw new RunNotFailedError()

      const { ids, cursors, stage: failedStage } = prepareRetry(old)

      await tx.insert(messages).values({ id: assistantMessageId, chatId: input.chatId, role: 'assistant', parts: [] })
      const [row] = await tx
        .insert(runs)
        .values({
          id: crypto.randomUUID(),
          chatId: input.chatId,
          userId: input.userId,
          assistantMessageId,
          status: 'queued',
          stage: failedStage,
          config: old.config,
          ids,
          cursors,
          error: null,
        })
        .returning()

      const oldEvents = await tx.select().from(runEvents).where(eq(runEvents.runId, old.id)).orderBy(asc(runEvents.seq))
      const copied = oldEvents.filter(
        (event) =>
          !SKIPPED_KINDS.has(event.kind) && !(event.kind === 'stage' && (event.payload as StageData).stage === failedStage),
      )
      const retrying: StageData = { stage: failedStage, status: 'pending', message: 'Retrying' }
      const values = [
        ...copied.map((event) => {
          if (!(EVENT_KINDS as readonly string[]).includes(event.kind)) throw new Error(`unknown_event_kind:${event.kind}`)
          payloadSchemaFor(event.kind as EventKind).parse(event.payload)
          return { kind: event.kind, partId: event.partId, payload: event.payload }
        }),
        { kind: 'stage', partId: partIdFor('stage', retrying), payload: retrying },
      ]
      await tx.insert(runEvents).values(values.map((event, index) => ({ runId: row!.id, seq: index + 1, ...event })))
      await tx.update(chats).set({ updatedAt: sql`now()` }).where(eq(chats.id, input.chatId))
      return row!
    })
    return { run, assistantMessageId }
  } catch (error) {
    if (isActiveRunViolation(error)) throw new RunActiveError()
    throw error
  }
}
