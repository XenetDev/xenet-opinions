import { type Chat, type Message, type Run, schema } from '@xo/db'
import { generateId } from 'ai'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { isChatId } from '@/lib/chat-id'
import { db } from '@/lib/db'
import { storage } from '@/lib/storage'
import { cancelActiveRun, RunNotActiveError, RunNotFoundError } from './runs'

const { chats, messages, uploads } = schema

export async function createChat(userId: string): Promise<Chat> {
  const [chat] = await db.insert(chats).values({ id: generateId(), userId, title: '' }).returning()
  return chat!
}

export async function getOwnedChat(chatId: string, userId: string): Promise<Chat | null> {
  const [chat] = await db
    .select()
    .from(chats)
    .where(and(eq(chats.id, chatId), eq(chats.userId, userId)))
    .limit(1)
  return chat ?? null
}

export async function ensureOwnedChat(chatId: string, userId: string): Promise<Chat | null> {
  if (!isChatId(chatId)) return null
  await db.insert(chats).values({ id: chatId, userId, title: '' }).onConflictDoNothing()
  return getOwnedChat(chatId, userId)
}

export async function appendMessage(input: {
  chatId: string
  id?: string
  role: 'user' | 'assistant'
  parts: unknown[]
}): Promise<Message> {
  const [message] = await db
    .insert(messages)
    .values({ id: input.id ?? generateId(), chatId: input.chatId, role: input.role, parts: input.parts })
    .returning()
  return message!
}

export async function updateMessageParts(id: string, parts: unknown[]): Promise<void> {
  await db.update(messages).set({ parts }).where(eq(messages.id, id))
}

export async function getMessage(id: string): Promise<Message | null> {
  const [message] = await db.select().from(messages).where(eq(messages.id, id)).limit(1)
  return message ?? null
}

export async function listMessages(chatId: string): Promise<Message[]> {
  return db.select().from(messages).where(eq(messages.chatId, chatId)).orderBy(asc(messages.createdAt))
}

export type ChatSummary = {
  id: string
  title: string
  updatedAt: Date
  runStatus: Run['status'] | 'none'
  firstFile?: string
}

export async function listChats(userId: string): Promise<ChatSummary[]> {
  const rows = await db
    .select({
      id: chats.id,
      title: chats.title,
      updatedAt: chats.updatedAt,
      runStatus: sql<
        ChatSummary['runStatus']
      >`coalesce((select r.status from runs r where r.chat_id = chats.id order by r.queued_at desc limit 1), 'none')`,
      firstFile: sql<
        string | null
      >`(select u.filename from uploads u where u.chat_id = chats.id order by u.created_at asc, u.filename asc limit 1)`,
    })
    .from(chats)
    .where(eq(chats.userId, userId))
    .orderBy(desc(chats.updatedAt))
  return rows.map(({ firstFile, ...row }) => (firstFile ? { ...row, firstFile } : row))
}

export async function renameChat(chatId: string, title: string): Promise<void> {
  await db.update(chats).set({ title }).where(eq(chats.id, chatId))
}

export async function deleteChat(chatId: string): Promise<void> {
  const rows = await db.select({ key: uploads.storageKey }).from(uploads).where(eq(uploads.chatId, chatId))
  try {
    await cancelActiveRun(chatId)
  } catch (error) {
    if (!(error instanceof RunNotActiveError || error instanceof RunNotFoundError)) throw error
  }
  await db.delete(chats).where(eq(chats.id, chatId))
  await Promise.allSettled(rows.map(async ({ key }) => storage.delete(key)))
}
