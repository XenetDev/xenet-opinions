import type { Message } from '@xo/db'
import { CHAT_HISTORY_TURNS } from './keepalive'

export type ChatTurn = { role: string; content: string }

const textOf = (parts: unknown[]) =>
  parts
    .filter((p): p is { type: 'text'; text: string } => {
      const part = p as { type?: unknown; text?: unknown } | null
      return part?.type === 'text' && typeof part.text === 'string'
    })
    .map((p) => p.text)

export const buildChatHistory = (
  rows: Message[],
  opts: { afterMessageId: string; excludeMessageId?: string; maxTurns?: number },
): ChatTurn[] => {
  const { afterMessageId, excludeMessageId, maxTurns = CHAT_HISTORY_TURNS } = opts
  const anchor = rows.findIndex((r) => r.id === afterMessageId)
  const turns: ChatTurn[] = []
  for (const row of rows.slice(anchor + 1)) {
    if (row.id === excludeMessageId) continue
    const texts = textOf(row.parts)
    if (texts.length === 0) continue
    turns.push({ role: row.role, content: texts.join('') })
  }
  return turns.slice(-maxTurns * 2)
}
