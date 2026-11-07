import { type Research, schema } from '@xo/db'
import { generateId } from 'ai'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'

const { research } = schema

export async function saveResearch(input: { userId: string; chatId: string; research: Research }): Promise<string> {
  const id = generateId()
  await db.insert(research).values({ id, userId: input.userId, chatId: input.chatId, payload: input.research })
  return id
}

export async function readOwnedResearch(id: string, userId: string): Promise<Research | null> {
  const [row] = await db
    .select({ payload: research.payload })
    .from(research)
    .where(and(eq(research.id, id), eq(research.userId, userId)))
  return row?.payload ?? null
}
