'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  useSidebar,
} from '@/components/ui/sidebar'
import type { ChatListItem } from '../chat-list-context'
import { chatTitle, groupChatsByDay, isRunning } from './chat-meta'

export function History({
  chats,
  activeId,
  activeRunning,
  guest = false,
}: {
  chats: ChatListItem[]
  activeId?: string
  activeRunning: boolean
  guest?: boolean
}) {
  const { isMobile, setOpenMobile } = useSidebar()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const groups = useMemo(() => (mounted ? groupChatsByDay(chats) : []), [mounted, chats])

  if (!mounted)
    return (
      <div data-testid="history">
        <SidebarGroup>
          <SidebarMenu>
            {[0, 1, 2].map((key) => (
              <SidebarMenuItem key={key}>
                <SidebarMenuSkeleton />
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </div>
    )

  if (groups.length === 0)
    return (
      <div data-testid="history">
        <SidebarGroup className="gap-1 px-4 text-xs text-muted-foreground">
          <p>No chats yet</p>
          {guest && <p>Chats on this device only. Sign in to keep them.</p>}
        </SidebarGroup>
      </div>
    )

  return (
    <div data-testid="history">
      {groups.map((group) => (
        <SidebarGroup key={group.label}>
          <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
          <SidebarMenu>
            {group.chats.map((chat) => {
              const active = chat.id === activeId
              const running = (active && activeRunning) || isRunning(chat.runStatus)
              return (
                <SidebarMenuItem key={chat.id}>
                  <SidebarMenuButton asChild size="sm" isActive={active}>
                    <Link
                      href={`/c/${chat.id}`}
                      aria-current={active ? 'page' : undefined}
                      onClick={() => isMobile && setOpenMobile(false)}
                    >
                      <span className="min-w-0 flex-1 truncate">{chatTitle(chat)}</span>
                      {running && (
                        <span
                          role="img"
                          aria-label="Working"
                          className="size-1.5 shrink-0 animate-pulse rounded-full bg-primary motion-reduce:animate-none"
                        />
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroup>
      ))}
    </div>
  )
}
