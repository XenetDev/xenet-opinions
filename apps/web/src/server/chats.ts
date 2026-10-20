import { and, asc, eq } from 'drizzle-orm'
import { schema, type Chat, type Message } from '@xo/db'
import { generateId } from 'ai'
import { db } from '@/lib/db'

const { chats, messages } = schema

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

export async function listMessages(chatId: string): Promise<Message[]> {
  return db.select().from(messages).where(eq(messages.chatId, chatId)).orderBy(asc(messages.createdAt))
}
