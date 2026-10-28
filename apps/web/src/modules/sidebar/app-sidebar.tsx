'use client'

import { PlusIcon } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { ChatList } from './chat-list'
import { useChatList } from './chat-list-context'

export function AppSidebar({ activeId }: { activeId?: string }) {
  const { chats } = useChatList()
  const pathname = usePathname()
  const active = activeId ?? /^\/c\/([^/]+)/.exec(pathname)?.[1]

  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link href="/">
                <PlusIcon />
                <span>New conversation</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <ChatList chats={chats} activeId={active} />
      </SidebarContent>
    </Sidebar>
  )
}
