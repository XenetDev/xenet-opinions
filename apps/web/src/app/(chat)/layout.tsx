import { headers } from 'next/headers'
import type { ReactNode } from 'react'
import { getSessionUser } from '@/lib/session'
import { ChatActivityProvider } from '@/modules/chat/chat-activity'
import { ChatListProvider } from '@/modules/chat/chat-list-context'
import { ChatHeader } from '@/modules/chat/header/chat-header'
import { listChats } from '@/server/chats'

export default async function ChatLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser(await headers())
  const chats = user ? await listChats(user.id) : []

  return (
    <ChatListProvider chats={chats.map((chat) => ({ ...chat, updatedAt: chat.updatedAt.toISOString() }))}>
      <ChatActivityProvider>
        <div className="flex h-svh flex-col">
          <ChatHeader />
          <main className="flex min-h-0 flex-1 flex-col">{children}</main>
        </div>
      </ChatActivityProvider>
    </ChatListProvider>
  )
}
