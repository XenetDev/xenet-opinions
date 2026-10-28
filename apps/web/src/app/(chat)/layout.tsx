import { headers } from 'next/headers'
import type { ReactNode } from 'react'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { getSessionUser } from '@/lib/session'
import { AppSidebar } from '@/modules/sidebar/app-sidebar'
import { ChatListProvider } from '@/modules/sidebar/chat-list-context'
import { listChats } from '@/server/chats'

export default async function ChatLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser(await headers())
  const chats = user ? await listChats(user.id) : []

  return (
    <SidebarProvider>
      <ChatListProvider chats={chats}>
        <AppSidebar />
        <SidebarInset className="h-svh">
          <header className="flex h-12 shrink-0 items-center px-2">
            <SidebarTrigger />
          </header>
          {children}
        </SidebarInset>
      </ChatListProvider>
    </SidebarProvider>
  )
}
