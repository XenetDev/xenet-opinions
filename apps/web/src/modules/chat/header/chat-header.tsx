'use client'

import { PlusIcon } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import { Badge } from '@/components/reui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useChatActivity } from '../chat-activity'
import { useChatList } from '../chat-list-context'
import { ChatOptions } from './chat-options'
import { chatTitle, isRunning, ThreadSwitcher } from './thread-switcher'

export function ChatHeader() {
  const router = useRouter()
  const pathname = usePathname()
  const { chats } = useChatList()
  const { activity } = useChatActivity()
  const activeId = /^\/c\/([^/]+)/.exec(pathname)?.[1]
  const chat = activeId ? (chats.find((item) => item.id === activeId) ?? { id: activeId, title: '' }) : undefined
  const own = activity && activity.chatId === activeId ? activity : undefined
  const running = !!chat && (!!own?.running || ('runStatus' in chat && isRunning(chat.runStatus)))
  const goHome = () => router.push('/')

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 bg-background/70 px-3 backdrop-blur-md after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-6 after:bg-gradient-to-b after:from-background after:to-transparent supports-backdrop-filter:bg-background/60 sm:px-4">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <ThreadSwitcher
          title={chat ? chatTitle(chat) : 'New chat'}
          chats={chats}
          activeId={activeId}
          liveStep={own?.running ? own.step : undefined}
          onNewChat={goHome}
        />
        {running && (
          <Badge variant="primary-light" size="sm" className="shrink-0 max-md:hidden">
            Working
          </Badge>
        )}
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="New chat" onClick={goHome}>
            <PlusIcon aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>New chat</TooltipContent>
      </Tooltip>
      {chat && <ChatOptions chat={chat} />}
    </header>
  )
}
