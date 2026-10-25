'use client'

import { PlusIcon } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
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
  const router = useRouter()
  const pathname = usePathname()
  const [creating, setCreating] = useState(false)
  const active = activeId ?? /^\/c\/([^/]+)/.exec(pathname)?.[1]

  async function createChat() {
    setCreating(true)
    const res = await fetch('/api/chats', { method: 'POST' }).catch(() => null)
    setCreating(false)
    if (!res?.ok) return
    const { id } = (await res.json()) as { id: string }
    router.push(`/c/${id}`)
    router.refresh()
  }

  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton disabled={creating} onClick={() => void createChat()}>
              <PlusIcon />
              <span>New conversation</span>
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
