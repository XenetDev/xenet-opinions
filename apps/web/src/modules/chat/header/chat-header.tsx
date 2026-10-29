'use client'

import { SearchIcon } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { Badge } from '@/components/reui/badge'
import { Button } from '@/components/ui/button'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { useChatActivity } from '../chat-activity'
import { useChatList } from '../chat-list-context'
import { chatTitle, isRunning } from '../shell/chat-meta'
import { AccountMenu } from './account-menu'
import { ChatOptions } from './chat-options'
import { ThemeToggle } from './theme-toggle'

export function ChatHeader({ signInAvailable, onSearch }: { signInAvailable: boolean; onSearch: () => void }) {
  const pathname = usePathname()
  const { chats } = useChatList()
  const { activity } = useChatActivity()
  const activeId = /^\/c\/([^/]+)/.exec(pathname)?.[1]
  const chat = activeId ? (chats.find((item) => item.id === activeId) ?? { id: activeId, title: '' }) : undefined
  const own = activity && activity.chatId === activeId ? activity : undefined
  const running = !!chat && (!!own?.running || ('runStatus' in chat && isRunning(chat.runStatus)))

  return (
    <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 bg-background/70 px-3 backdrop-blur-md after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-6 after:bg-gradient-to-b after:from-background after:to-transparent supports-backdrop-filter:bg-background/60 sm:px-4">
      <SidebarTrigger aria-label="Open sidebar" className="md:hidden" />
      <h1 className="min-w-0 flex-1 truncate text-sm font-medium">{chat ? chatTitle(chat) : 'New chat'}</h1>
      {running && (
        <Badge variant="primary-light" size="sm" className="shrink-0">
          Working
        </Badge>
      )}
      <Button variant="ghost" size="icon-sm" aria-label="Search chats" className="md:hidden" onClick={onSearch}>
        <SearchIcon aria-hidden="true" />
      </Button>
      {chat && <ChatOptions chat={chat} />}
      <ThemeToggle />
      <AccountMenu signInAvailable={signInAvailable} />
    </header>
  )
}
