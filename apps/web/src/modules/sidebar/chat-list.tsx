'use client'

import { SidebarGroup, SidebarGroupContent, SidebarMenu } from '@/components/ui/sidebar'
import { ChatItem, type SidebarChat } from './chat-item'

export function ChatList({ chats, activeId }: { chats: SidebarChat[]; activeId?: string }) {
  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {chats.map((chat) => (
            <ChatItem key={chat.id} chat={chat} active={chat.id === activeId} />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
