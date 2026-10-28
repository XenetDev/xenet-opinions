import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'
import { index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { user } from './auth'

export const chats = pgTable(
  'chats',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    title: text('title').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('chats_user_id_updated_at_idx').on(t.userId, t.updatedAt)],
)

export const messages = pgTable(
  'messages',
  {
    id: text('id').primaryKey(),
    chatId: text('chat_id')
      .notNull()
      .references(() => chats.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    parts: jsonb('parts').$type<unknown[]>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('messages_chat_id_created_at_idx').on(t.chatId, t.createdAt)],
)

export type Chat = InferSelectModel<typeof chats>
export type NewChat = InferInsertModel<typeof chats>
export type Message = InferSelectModel<typeof messages>
export type NewMessage = InferInsertModel<typeof messages>
