import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'
import { jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { user } from './auth'

export type ResearchSource = { title: string; url: string; excerpt: string; publishedAt?: string }

export type Research = { query: string; digest: string; sources: ResearchSource[] }

export const research = pgTable('research', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  chatId: text('chat_id').notNull(),
  payload: jsonb('payload').$type<Research>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type ResearchRow = InferSelectModel<typeof research>
export type NewResearchRow = InferInsertModel<typeof research>
