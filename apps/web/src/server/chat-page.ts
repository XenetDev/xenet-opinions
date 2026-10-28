import { materialiseRun } from '@xo/engine'
import type { OpinionsUIMessage, Stage } from '@xo/engine/parts'
import { listMessages } from '@/server/chats'
import { runStore } from '@/server/runs'
import { toUIMessages } from '@/server/ui-message'

export type ActiveRun = {
  id: string
  assistantMessageId: string
  stage: Stage
  reportRequested: boolean
  envKeepaliveUntil: string | null
}
export type EnvState = 'none' | 'open' | 'closed'
export type LatestRun = {
  id: string
  status: string
  assistantMessageId: string
  envState: EnvState
  envKeepaliveUntil: Date | null
}

const TERMINAL = new Set(['done', 'failed', 'cancelled'])

export async function loadChatPage(
  chatId: string,
  _userId: string,
): Promise<{ initialMessages: OpinionsUIMessage[]; activeRun: ActiveRun | null; latestRun: LatestRun | null }> {
  const [rows, latest] = await Promise.all([listMessages(chatId), runStore.getLatestByChat(chatId)])
  const messages = toUIMessages(rows)
  const active = latest && (latest.status === 'queued' || latest.status === 'running') ? latest : null
  const latestRun: LatestRun | null = latest
    ? {
        id: latest.id,
        status: latest.status,
        assistantMessageId: latest.assistantMessageId,
        envState: latest.envState === 'open' || latest.envState === 'closed' ? latest.envState : 'none',
        envKeepaliveUntil: latest.envKeepaliveUntil,
      }
    : null
  if (active) {
    return {
      initialMessages: messages.filter((message) => message.id !== active.assistantMessageId),
      activeRun: {
        id: active.id,
        assistantMessageId: active.assistantMessageId,
        stage: active.stage as Stage,
        reportRequested: active.cursors.reportRequested === true,
        envKeepaliveUntil: active.envKeepaliveUntil?.toISOString() ?? null,
      },
      latestRun,
    }
  }

  if (latest && TERMINAL.has(latest.status)) {
    const target = messages.find((message) => message.id === latest.assistantMessageId)
    if (target && target.parts.length === 0) {
      const parts = await materialiseRun(runStore, latest.id)
      return {
        initialMessages: messages.map((message) => (message === target ? { ...message, parts } : message)),
        activeRun: null,
        latestRun,
      }
    }
  }
  return { initialMessages: messages, activeRun: null, latestRun }
}
