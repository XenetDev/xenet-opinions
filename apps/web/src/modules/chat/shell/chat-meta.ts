import type { ChatListItem } from '../chat-list-context'
import { startOfDay } from '../relative-time'

const DAY = 86_400_000

export const chatTitle = (chat: Pick<ChatListItem, 'title'>) => chat.title || 'New conversation'

export const isRunning = (runStatus: string | undefined) => runStatus === 'queued' || runStatus === 'running'

export function groupChatsByDay(chats: ChatListItem[], now = new Date()): { label: string; chats: ChatListItem[] }[] {
  const today = startOfDay(now)
  const fixed = ['Today', 'Yesterday', 'Previous 7 days', 'Previous 30 days']
  const groups = new Map<string, ChatListItem[]>(fixed.map((label) => [label, []]))
  const months: { label: string; key: number }[] = []

  for (const chat of [...chats].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) {
    const then = new Date(chat.updatedAt)
    const days = Math.round((today - startOfDay(then)) / DAY)
    let label: string
    if (days <= 0) label = 'Today'
    else if (days === 1) label = 'Yesterday'
    else if (days <= 7) label = 'Previous 7 days'
    else if (days <= 30) label = 'Previous 30 days'
    else {
      label = then.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      if (!groups.has(label)) months.push({ label, key: then.getFullYear() * 12 + then.getMonth() })
    }
    const list = groups.get(label) ?? []
    list.push(chat)
    groups.set(label, list)
  }

  months.sort((a, b) => b.key - a.key)
  return [...fixed, ...months.map((m) => m.label)]
    .map((label) => ({ label, chats: groups.get(label) ?? [] }))
    .filter((g) => g.chats.length > 0)
}
