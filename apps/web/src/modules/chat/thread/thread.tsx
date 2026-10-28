'use client'

import type { OpinionsUIMessage, SourcesData } from '@xo/engine/parts'
import { type ReactNode, useLayoutEffect, useState } from 'react'
import { Marker, MarkerContent } from '@/components/ui/marker'
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@/components/ui/message-scroller'
import { cn } from '@/lib/utils'
import { AssistantTurn, UserTurn } from './turn'

const ENTER = 'animate-in fade-in-50 slide-in-from-bottom-1 duration-300 motion-reduce:animate-none'

function useArrivals(ids: string[]): Map<string, Date> {
  const [initial] = useState(() => new Set(ids))
  const [arrivals, setArrivals] = useState(() => new Map<string, Date>())
  const key = ids.join('\n')

  useLayoutEffect(() => {
    setArrivals((current) => {
      const fresh = key.split('\n').filter((id) => id && !initial.has(id) && !current.has(id))
      if (fresh.length === 0) return current
      const now = new Date()
      return new Map([...current, ...fresh.map((id) => [id, now] as const)])
    })
  }, [key, initial])

  return arrivals
}

const clock = (date: Date) => date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

export function Thread({
  messages,
  renderAssistant,
  sources,
  startedAt,
  className,
}: {
  messages: OpinionsUIMessage[]
  renderAssistant: (message: OpinionsUIMessage) => ReactNode
  sources?: SourcesData
  startedAt?: string
  className?: string
}) {
  const arrivals = useArrivals(messages.map((message) => message.id))
  const firstUserId = messages.find((message) => message.role === 'user')?.id
  const first = messages[0]
  const startDate = startedAt ? new Date(startedAt) : first ? arrivals.get(first.id) : undefined

  return (
    <MessageScrollerProvider autoScroll>
      <MessageScroller className={className}>
        <MessageScrollerViewport className="[--scroll-fade-b-size:2.5rem] [overflow-anchor:none]">
          <MessageScrollerContent className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-7 px-4 pt-6 pb-10 sm:px-6">
            {startDate && (
              <MessageScrollerItem className="[content-visibility:visible]">
                <Marker variant="separator">
                  <MarkerContent className="text-[13px]" suppressHydrationWarning>
                    {startDate.toLocaleDateString()}
                  </MarkerContent>
                </Marker>
              </MessageScrollerItem>
            )}
            {messages.map((message) => {
              const arrived = arrivals.get(message.id)
              return (
                <MessageScrollerItem
                  key={message.id}
                  messageId={message.id}
                  className={cn('flex flex-col gap-4 [content-visibility:visible]', arrived && ENTER)}
                >
                  {message.role === 'user' ? (
                    <UserTurn message={message} sources={message.id === firstUserId ? sources : undefined} />
                  ) : (
                    <AssistantTurn time={arrived && clock(arrived)}>{renderAssistant(message)}</AssistantTurn>
                  )}
                </MessageScrollerItem>
              )
            })}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton variant="outline" size="icon-sm" className="bottom-4 rounded-full shadow-sm" />
      </MessageScroller>
    </MessageScrollerProvider>
  )
}
