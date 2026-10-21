import { and, count, eq, inArray, sql } from 'drizzle-orm'
import { generateId } from 'ai'
import { schema, type Run } from '@xo/db'
import { createDrizzleStore } from '@xo/engine'
import { db } from '@/lib/db'

const { messages, runs, uploads } = schema

export const runStore = createDrizzleStore(db)

export class RunActiveError extends Error {
  constructor() {
    super('run_active')
    this.name = 'RunActiveError'
  }
}

function isActiveRunViolation(error: unknown): boolean {
  for (let current = error as { message?: string; cause?: unknown } | undefined, depth = 0; current && depth < 4; depth++) {
    if (typeof current.message === 'string' && current.message.includes('runs_one_active_per_chat')) return true
    current = current.cause as typeof current
  }
  return false
}

export async function countOwnedUploads(input: { chatId: string; userId: string; uploadIds: string[] }): Promise<number> {
  if (input.uploadIds.length === 0) return 0
  const [row] = await db
    .select({ n: count() })
    .from(uploads)
    .where(and(inArray(uploads.id, input.uploadIds), eq(uploads.chatId, input.chatId), eq(uploads.userId, input.userId)))
  return row?.n ?? 0
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
      return row!
    })
    return { run, assistantMessageId }
  } catch (error) {
    if (isActiveRunViolation(error)) throw new RunActiveError()
    throw error
  }
}
