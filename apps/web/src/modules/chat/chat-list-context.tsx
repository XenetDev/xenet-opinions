'use client'

import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react'

export type ChatListItem = { id: string; title: string; runStatus: string; updatedAt: string }

export type ChatUpsert = { id: string; title?: string; runStatus?: string }

type ChatListValue = {
  chats: ChatListItem[]
  upsertChat: (chat: ChatUpsert) => void
  removeChat: (id: string) => void
}

const ChatListContext = createContext<ChatListValue>({ chats: [], upsertChat: () => {}, removeChat: () => {} })

export function ChatListProvider({ chats: seed, children }: { chats: ChatListItem[]; children: ReactNode }) {
  const [chats, setChats] = useState(seed)
  const [seen, setSeen] = useState(seed)
  if (seen !== seed) {
    setSeen(seed)
    setChats(seed)
  }

  const upsertChat = useCallback(({ id, title, runStatus }: ChatUpsert) => {
    setChats((current) => {
      const existing = current.find((chat) => chat.id === id)
      if (!existing)
        return [
          { id, title: title ?? '', runStatus: runStatus ?? 'none', updatedAt: new Date().toISOString() },
          ...current,
        ]
      const next = { ...existing, ...(title !== undefined && { title }), ...(runStatus !== undefined && { runStatus }) }
      if (next.title === existing.title && next.runStatus === existing.runStatus) return current
      return current.map((chat) => (chat.id === id ? next : chat))
    })
  }, [])

  const removeChat = useCallback((id: string) => setChats((current) => current.filter((chat) => chat.id !== id)), [])

  const value = useMemo(() => ({ chats, upsertChat, removeChat }), [chats, upsertChat, removeChat])
  return <ChatListContext.Provider value={value}>{children}</ChatListContext.Provider>
}

export const useChatList = () => useContext(ChatListContext)
