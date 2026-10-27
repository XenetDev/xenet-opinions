import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'
import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { chats } from './chats'
import { runs } from './runs'

export const interviews = pgTable(
  'interviews',
  {
    id: text('id').primaryKey(),
    chatId: text('chat_id')
      .notNull()
      .references(() => chats.id, { onDelete: 'cascade' }),
    runId: text('run_id')
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),
    messageId: text('message_id').notNull(),
    questionId: text('question_id'),
    agentId: text('agent_id').notNull(),
    agentName: text('agent_name').notNull(),
    question: text('question').notNull(),
    answer: text('answer'),
    status: text('status').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('interviews_chat_id_created_at_idx').on(t.chatId, t.createdAt)],
)

export type Interview = InferSelectModel<typeof interviews>
export type NewInterview = InferInsertModel<typeof interviews>
