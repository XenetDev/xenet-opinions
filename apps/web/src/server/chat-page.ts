import type { OpinionsUIMessage, Stage } from '@xo/engine/parts'
import { materialiseRun } from '@xo/engine'
import { listMessages } from '@/server/chats'
import { runStore } from '@/server/runs'
import { toUIMessages } from '@/server/ui-message'

export type ActiveRun = { id: string; assistantMessageId: string; stage: Stage }

const TERMINAL = new Set(['done', 'failed', 'cancelled'])

export async function loadChatPage(
  chatId: string,
  _userId: string,
): Promise<{ initialMessages: OpinionsUIMessage[]; activeRun: ActiveRun | null }> {
  const messages = toUIMessages(await listMessages(chatId))
  const active = await runStore.getActiveByChat(chatId)
  if (active) {
    return {
      initialMessages: messages.filter((message) => message.id !== active.assistantMessageId),
      activeRun: { id: active.id, assistantMessageId: active.assistantMessageId, stage: active.stage as Stage },
    }
  }

  const latest = await runStore.getLatestByChat(chatId)
  if (latest && TERMINAL.has(latest.status)) {
    const target = messages.find((message) => message.id === latest.assistantMessageId)
    if (target && target.parts.length === 0) {
      const parts = await materialiseRun(runStore, latest.id)
      return {
        initialMessages: messages.map((message) => (message === target ? { ...message, parts } : message)),
        activeRun: null,
      }
    }
  }
  return { initialMessages: messages, activeRun: null }
}
