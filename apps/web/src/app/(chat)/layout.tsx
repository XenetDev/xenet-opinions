import type { ReactNode } from 'react'
import { headers } from 'next/headers'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { getSessionUser } from '@/lib/session'
import { listChats } from '@/server/chats'
import { AppSidebar } from '@/modules/sidebar/app-sidebar'
import { ChatListProvider } from '@/modules/sidebar/chat-list-context'

export default async function ChatLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser(await headers())
  const chats = user ? await listChats(user.id) : []

  return (
    <SidebarProvider>
      <ChatListProvider chats={chats}>
        <AppSidebar />
        <SidebarInset>
          <header className="flex h-12 shrink-0 items-center px-2">
            <SidebarTrigger />
          </header>
          {children}
        </SidebarInset>
      </ChatListProvider>
    </SidebarProvider>
  )
}
