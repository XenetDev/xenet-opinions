'use client'

import { ChevronDownIcon, PlusIcon } from 'lucide-react'
import Link from 'next/link'
import { type Ref, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { ChatListItem } from '../chat-list-context'
import { relativeTime, startOfDay } from '../relative-time'
import { chatTitle, isRunning } from '../shell/chat-meta'

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'today', label: 'Today' },
  { id: 'earlier', label: 'Earlier' },
] as const

function SwitcherRow({
  chat,
  active,
  liveLabel,
  onSelect,
  ref,
}: {
  chat: ChatListItem
  active: boolean
  liveLabel?: string
  onSelect: () => void
  ref?: Ref<HTMLAnchorElement>
}) {
  return (
    <Button
      asChild
      variant={active ? 'secondary' : 'ghost'}
      className="h-auto w-full shrink flex-col items-stretch justify-center gap-0.5 px-2 py-1.5 text-sm font-normal"
    >
      <Link ref={ref} href={`/c/${chat.id}`} aria-current={active ? 'page' : undefined} onClick={onSelect}>
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-start">{chatTitle(chat)}</span>
          <span
            suppressHydrationWarning
            className="w-14 shrink-0 text-end text-[11px] text-muted-foreground tabular-nums"
          >
            {relativeTime(chat.updatedAt)}
          </span>
        </span>
        {liveLabel && (
          <span className="flex min-w-0 items-center gap-1.5 text-[11px]/4 text-muted-foreground">
            <Spinner aria-hidden="true" className="size-3 shrink-0 motion-reduce:animate-none" />
            <span className="shimmer min-w-0 truncate">{liveLabel}</span>
          </span>
        )}
      </Link>
    </Button>
  )
}

export function ThreadSwitcher({
  title,
  chats,
  activeId,
  liveStep,
  onNewChat,
}: {
  title: string
  chats: ChatListItem[]
  activeId?: string
  liveStep?: string
  onNewChat: () => void
}) {
  const [open, setOpen] = useState(false)
  const activeRow = useRef<HTMLAnchorElement>(null)
  const [tab, setTab] = useState<string>('all')
  const todayStart = startOfDay(new Date())
  const today = chats.filter((chat) => new Date(chat.updatedAt).getTime() >= todayStart)
  const earlier = chats.filter((chat) => new Date(chat.updatedAt).getTime() < todayStart)
  const groups = [
    { label: 'Today', chats: today },
    { label: 'Earlier', chats: earlier },
  ].filter((group) => group.chats.length > 0)

  const renderRow = (chat: ChatListItem) => (
    <SwitcherRow
      key={chat.id}
      chat={chat}
      active={chat.id === activeId}
      ref={chat.id === activeId ? activeRow : undefined}
      liveLabel={(chat.id === activeId && liveStep) || (isRunning(chat.runStatus) ? 'Working' : undefined)}
      onSelect={() => setOpen(false)}
    />
  )

  const empty = <p className="px-2 py-6 text-center text-sm text-muted-foreground">No chats yet</p>

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Switch chat, ${title}`}
          className="-ms-1 min-w-0 shrink gap-1.5 px-2 font-medium"
        >
          <span className="min-w-0 truncate">{title}</span>
          <ChevronDownIcon className="opacity-60" data-icon="inline-end" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        aria-label="Chats"
        onOpenAutoFocus={(event) => {
          if (!activeRow.current) return
          event.preventDefault()
          activeRow.current.focus()
        }}
        align="start"
        className="flex max-h-96 w-84 max-w-(--radix-popover-content-available-width) flex-col gap-0 p-0"
      >
        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col gap-0">
          <div className="flex h-11 shrink-0 items-center gap-1 border-b border-border px-2">
            <TabsList variant="line" className="h-full gap-0 p-0">
              {TABS.map((item) => (
                <TabsTrigger key={item.id} value={item.id} className="h-full! flex-none px-2 after:-bottom-px!">
                  {item.label}
                </TabsTrigger>
              ))}
            </TabsList>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="New chat"
                  className="ms-auto"
                  onClick={() => {
                    setOpen(false)
                    onNewChat()
                  }}
                >
                  <PlusIcon aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>New chat</TooltipContent>
            </Tooltip>
          </div>
          <TabsContent value="all" className="min-h-0 flex-1 overflow-y-auto p-2">
            {groups.length === 0
              ? empty
              : groups.map((group) => (
                  <section key={group.label} aria-label={group.label} className="flex flex-col gap-1 pt-3 first:pt-0">
                    <span aria-hidden="true" className="px-2 text-xs text-muted-foreground">
                      {group.label}
                    </span>
                    {group.chats.map(renderRow)}
                  </section>
                ))}
          </TabsContent>
          {(['today', 'earlier'] as const).map((id) => {
            const list = id === 'today' ? today : earlier
            return (
              <TabsContent key={id} value={id} className="min-h-0 flex-1 overflow-y-auto p-2">
                {list.length === 0 ? empty : <div className="flex flex-col gap-1">{list.map(renderRow)}</div>}
              </TabsContent>
            )
          })}
        </Tabs>
      </PopoverContent>
    </Popover>
  )
}
