import { schema } from '@xo/db'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', async () => {
  const { createDb } = await import('@xo/db')
  return { db: createDb(process.env.DATABASE_URL ?? 'postgresql://localhost:1/none') }
})

import { db } from '@/lib/db'
import { reportSummaryFixture as summary } from '@/modules/report/fixture'
import { createShareLink, listShareTokens, loadSharedReport, revokeShareLink } from './share'

const userId = `us_${crypto.randomUUID()}`
const now = new Date()

async function mkChat() {
  const chatId = `c_${crypto.randomUUID()}`
  await db.insert(schema.chats).values({ id: chatId, userId, title: 'Chat title' })
  await db.insert(schema.messages).values({ id: `m_${crypto.randomUUID()}`, chatId, role: 'user', parts: [] })
  return chatId
}

async function mkRun(
  chatId: string,
  opts: { queuedAt: Date; events?: Array<{ kind: string; payload: unknown }>; requirement?: string },
) {
  const id = `r_${crypto.randomUUID()}`
  const assistantMessageId = `a_${crypto.randomUUID()}`
  await db.insert(schema.runs).values({
    id,
    chatId,
    userId,
    assistantMessageId,
    status: 'done',
    queuedAt: opts.queuedAt,
    finishedAt: new Date(opts.queuedAt.getTime() + 60_000),
    config: { requirement: opts.requirement ?? 'Should we raise prices?', maxRounds: 3, uploadIds: ['up1'] },
  })
  const events = opts.events ?? []
  if (events.length > 0)
    await db
      .insert(schema.runEvents)
      .values(events.map((e, i) => ({ runId: id, seq: i + 1, kind: e.kind, partId: e.kind, payload: e.payload })))
  return { id, assistantMessageId }
}

const withSummary = (payload: unknown = summary) => [
  { kind: 'interview', payload: { agentId: 1, question: 'private follow-up', answer: 'private answer' } },
  { kind: 'report_summary', payload },
]

describe.skipIf(!process.env.DATABASE_URL)('share links (real db)', () => {
  beforeAll(async () => {
    await db.insert(schema.user).values({
      id: userId,
      name: 'Owner Name',
      email: `${userId}@example.invalid`,
      emailVerified: false,
      isAnonymous: false,
      createdAt: now,
      updatedAt: now,
    })
  })

  afterAll(async () => {
    await db.delete(schema.user).where(eq(schema.user.id, userId))
    await db.$client.end()
  })

  it('creates a 24-byte base64url token, returns it again, and revokes it', async () => {
    const chatId = await mkChat()
    const run = await mkRun(chatId, { queuedAt: new Date('2026-11-01T10:00:00Z'), events: withSummary() })
    const token = await createShareLink(chatId)
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/)
    expect(Buffer.from(token!, 'base64url')).toHaveLength(24)
    expect(await createShareLink(chatId)).toBe(token)
    const [row] = await db.select().from(schema.runs).where(eq(schema.runs.id, run.id))
    expect(row?.shareToken).toBe(token)

    expect(await revokeShareLink(chatId)).toBe(true)
    expect(await loadSharedReport(token!)).toBeNull()
    const fresh = await createShareLink(chatId)
    expect(fresh).not.toBe(token)
  })

  it('shares the latest run with a summary by default, or a chosen run of the chat', async () => {
    const chatId = await mkChat()
    const older = await mkRun(chatId, { queuedAt: new Date('2026-11-01T10:00:00Z'), events: withSummary() })
    const newer = await mkRun(chatId, { queuedAt: new Date('2026-11-02T10:00:00Z'), events: withSummary() })
    await mkRun(chatId, { queuedAt: new Date('2026-11-03T10:00:00Z') })
    const latest = await createShareLink(chatId)
    const byRun = await createShareLink(chatId, { runId: older.id })
    const byMessage = await createShareLink(chatId, { messageId: older.assistantMessageId })
    expect(byRun).toBe(byMessage)
    expect(byRun).not.toBe(latest)
    const rows = await db.select().from(schema.runs).where(eq(schema.runs.chatId, chatId))
    expect(rows.find((r) => r.id === newer.id)?.shareToken).toBe(latest)
    expect(rows.find((r) => r.id === older.id)?.shareToken).toBe(byRun)
  })

  it('refuses runs without a summary or from another chat', async () => {
    const chatId = await mkChat()
    const bare = await mkRun(chatId, { queuedAt: new Date('2026-11-01T10:00:00Z') })
    expect(await createShareLink(chatId)).toBeNull()
    expect(await createShareLink(chatId, { runId: bare.id })).toBeNull()
    const otherChat = await mkChat()
    const foreign = await mkRun(otherChat, { queuedAt: new Date('2026-11-01T10:00:00Z'), events: withSummary() })
    expect(await createShareLink(chatId, { runId: foreign.id })).toBeNull()
    expect(await createShareLink(chatId, { messageId: foreign.assistantMessageId })).toBeNull()
    expect(await revokeShareLink(chatId, { runId: foreign.id })).toBe(false)
  })

  it('loads only the report: question, date and the latest summary', async () => {
    const chatId = await mkChat()
    await mkRun(chatId, {
      queuedAt: new Date('2026-11-01T10:00:00Z'),
      requirement: 'Should Toyota raise prices?',
      events: [...withSummary({ ...summary, verdict: 'Old verdict' }), { kind: 'report_summary', payload: summary }],
    })
    const token = await createShareLink(chatId)
    const report = await loadSharedReport(token!)
    expect(report).toEqual({ title: 'Should Toyota raise prices?', date: '2026-11-01T10:01:00.000Z', summary })
    expect(Object.keys(report!).sort()).toEqual(['date', 'summary', 'title'])
    expect(JSON.stringify(report)).not.toMatch(/private follow-up|private answer|Owner Name|example\.invalid|up1/)
  })

  it('lists live tokens of the chat by assistant message', async () => {
    const chatId = await mkChat()
    const shared = await mkRun(chatId, { queuedAt: new Date('2026-11-01T10:00:00Z'), events: withSummary() })
    const revoked = await mkRun(chatId, { queuedAt: new Date('2026-11-02T10:00:00Z'), events: withSummary() })
    await mkRun(chatId, { queuedAt: new Date('2026-11-03T10:00:00Z') })
    const token = await createShareLink(chatId, { runId: shared.id })
    await createShareLink(chatId, { runId: revoked.id })
    await revokeShareLink(chatId, { runId: revoked.id })
    const other = await mkChat()
    await mkRun(other, { queuedAt: new Date('2026-11-01T10:00:00Z'), events: withSummary() })
    await createShareLink(other)
    expect(await listShareTokens(chatId)).toEqual({ [shared.assistantMessageId]: token })
  })

  it('returns null for unknown, malformed, deleted-chat and invalid-summary tokens', async () => {
    expect(await loadSharedReport('A'.repeat(32))).toBeNull()
    expect(await loadSharedReport('not a token')).toBeNull()

    const deleted = await mkChat()
    await mkRun(deleted, { queuedAt: new Date('2026-11-01T10:00:00Z'), events: withSummary() })
    const gone = await createShareLink(deleted)
    await db.delete(schema.chats).where(eq(schema.chats.id, deleted))
    expect(await loadSharedReport(gone!)).toBeNull()

    const invalid = await mkChat()
    await mkRun(invalid, { queuedAt: new Date('2026-11-01T10:00:00Z'), events: withSummary({ verdict: 1 }) })
    const bad = await createShareLink(invalid)
    expect(bad).not.toBeNull()
    expect(await loadSharedReport(bad!)).toBeNull()
  })
})
