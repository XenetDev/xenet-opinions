import { randomBytes } from 'node:crypto'
import { schema } from '@xo/db'
import { type ReportSummary, ReportSummarySchema } from '@xo/engine/parts'
import { and, desc, eq, exists, sql } from 'drizzle-orm'
import { db } from '@/lib/db'

const { chats, runEvents, runs } = schema

export type ShareTarget = { runId?: string; messageId?: string }
export type SharedReport = { title: string; date: string; summary: ReportSummary }

const TOKEN = /^[A-Za-z0-9_-]{32}$/

export const newShareToken = () => randomBytes(24).toString('base64url')

const hasSummary = (runId: typeof runs.id) =>
  exists(
    db
      .select({ one: sql`1` })
      .from(runEvents)
      .where(and(eq(runEvents.runId, runId), eq(runEvents.kind, 'report_summary'))),
  )

async function shareableRunId(chatId: string, target: ShareTarget = {}): Promise<string | null> {
  const [row] = await db
    .select({ id: runs.id })
    .from(runs)
    .where(
      and(
        eq(runs.chatId, chatId),
        target.runId ? eq(runs.id, target.runId) : undefined,
        target.messageId ? eq(runs.assistantMessageId, target.messageId) : undefined,
        hasSummary(runs.id),
      ),
    )
    .orderBy(desc(runs.queuedAt))
    .limit(1)
  return row?.id ?? null
}

export async function createShareLink(chatId: string, target?: ShareTarget): Promise<string | null> {
  const runId = await shareableRunId(chatId, target)
  if (!runId) return null
  const [row] = await db
    .update(runs)
    .set({ shareToken: sql`coalesce(${runs.shareToken}, ${newShareToken()})` })
    .where(eq(runs.id, runId))
    .returning({ token: runs.shareToken })
  return row?.token ?? null
}

export async function revokeShareLink(chatId: string, target?: ShareTarget): Promise<boolean> {
  const runId = await shareableRunId(chatId, target)
  if (!runId) return false
  await db.update(runs).set({ shareToken: null }).where(eq(runs.id, runId))
  return true
}

export async function loadSharedReport(token: string): Promise<SharedReport | null> {
  if (!TOKEN.test(token)) return null
  const [run] = await db
    .select({ id: runs.id, config: runs.config, finishedAt: runs.finishedAt, queuedAt: runs.queuedAt })
    .from(runs)
    .innerJoin(chats, eq(chats.id, runs.chatId))
    .where(eq(runs.shareToken, token))
    .limit(1)
  if (!run) return null
  const [event] = await db
    .select({ payload: runEvents.payload })
    .from(runEvents)
    .where(and(eq(runEvents.runId, run.id), eq(runEvents.kind, 'report_summary')))
    .orderBy(desc(runEvents.seq))
    .limit(1)
  const parsed = ReportSummarySchema.safeParse(event?.payload)
  if (!parsed.success) return null
  return {
    title: run.config.requirement,
    date: (run.finishedAt ?? run.queuedAt).toISOString(),
    summary: parsed.data,
  }
}
