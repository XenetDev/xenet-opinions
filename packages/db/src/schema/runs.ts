import { sql } from 'drizzle-orm'
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { bigserial, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { user } from './auth'
import { chats } from './chats'

export type Stage = 'ontology' | 'graph_build' | 'sim_create' | 'sim_prepare' | 'sim_run' | 'report' | 'finished'

export const RUN_STAGES = ['ontology', 'graph_build', 'sim_create', 'sim_prepare', 'sim_run', 'report', 'finished'] as const satisfies readonly Stage[]

export type RunConfig = { requirement: string; maxRounds: number; uploadIds: string[] }

export type RunIds = Partial<{
  projectId: string
  graphId: string
  graphTaskId: string
  simulationId: string
  prepareTaskId: string
  reportId: string
  reportTaskId: string
}>

export type RunCursors = Partial<{
  agentLogLine: number
  startAttempts: number
  idlePolls: number
  postsOffsetTwitter: number
  postsOffsetReddit: number
  simStarted: boolean
  startAcked: boolean
  retries: number
  lastAgentCount: number
  prepareReady: boolean
  feed: RunFeedCursor
  reportEventCount: number
  reportOutline: RunOutlineCursor
}>

export type RunFeedCursor = {
  round: number
  totalRounds: number
  twitterActs: number
  redditActs: number
  posts: Array<{ id: string; platform: 'twitter' | 'reddit'; agent: string; content: string; round: number }>
}

export type RunOutlineCursor = {
  title?: string
  sections: Array<{ index: number; title: string; status: 'pending' | 'writing' | 'done' }>
}

export type RunError = { stage: Stage; code: string; message: string }

export const runs = pgTable(
  'runs',
  {
    id: text('id').primaryKey(),
    chatId: text('chat_id')
      .notNull()
      .references(() => chats.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    assistantMessageId: text('assistant_message_id').notNull(),
    retryOf: text('retry_of').references((): AnyPgColumn => runs.id, { onDelete: 'set null' }),
    status: text('status').notNull().default('queued'),
    stage: text('stage').$type<Stage>().notNull().default('ontology'),
    config: jsonb('config').$type<RunConfig>().notNull(),
    ids: jsonb('ids').$type<RunIds>().notNull().default({}),
    cursors: jsonb('cursors').$type<RunCursors>().notNull().default({}),
    error: jsonb('error').$type<RunError | null>(),
    attempt: integer('attempt').notNull().default(0),
    leaseOwner: text('lease_owner'),
    leaseUntil: timestamp('lease_until', { withTimezone: true }),
    envState: text('env_state').notNull().default('none'),
    envKeepaliveUntil: timestamp('env_keepalive_until', { withTimezone: true }),
    queuedAt: timestamp('queued_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    index('runs_status_queued_at_idx').on(t.status, t.queuedAt),
    uniqueIndex('runs_one_active_per_chat').on(t.chatId).where(sql`${t.status} in ('queued','running')`),
  ],
)

export const runEvents = pgTable(
  'run_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    runId: text('run_id')
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    kind: text('kind').notNull(),
    partId: text('part_id'),
    payload: jsonb('payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('run_events_run_id_seq_idx').on(t.runId, t.seq)],
)

export const uploads = pgTable('uploads', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  chatId: text('chat_id')
    .notNull()
    .references(() => chats.id, { onDelete: 'cascade' }),
  storageKey: text('storage_key').notNull(),
  filename: text('filename').notNull(),
  mediaType: text('media_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type Run = InferSelectModel<typeof runs>
export type NewRun = InferInsertModel<typeof runs>
export type RunEvent = InferSelectModel<typeof runEvents>
export type NewRunEvent = InferInsertModel<typeof runEvents>
export type Upload = InferSelectModel<typeof uploads>
export type NewUpload = InferInsertModel<typeof uploads>
