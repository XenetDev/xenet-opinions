'use client'

import type { OpinionsUIMessage, SourcesData } from '@xo/engine/parts'
import { type ReactNode, useEffect, useLayoutEffect, useState } from 'react'
import { Marker, MarkerContent } from '@/components/ui/marker'
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScroller,
} from '@/components/ui/message-scroller'
import { cn } from '@/lib/utils'
import { AssistantTurn, UserTurn } from './turn'

const PENDING_ID = 'pending-run'

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

function sourcesByTurn(messages: OpinionsUIMessage[]): Map<string, SourcesData> {
  const byTurn = new Map<string, SourcesData>()
  let userId: string | undefined
  for (const message of messages) {
    if (message.role === 'user') userId = message.id
    const part = message.parts.find((p) => p.type === 'data-sources')
    if (userId && part?.type === 'data-sources') byTurn.set(userId, part.data)
  }
  return byTurn
}

function FollowOnSend({ lastUserId }: { lastUserId?: string }) {
  const { scrollToEnd } = useMessageScroller()
  const [initial] = useState(lastUserId)
  useEffect(() => {
    if (lastUserId && lastUserId !== initial) scrollToEnd({ behavior: 'auto' })
  }, [lastUserId, initial, scrollToEnd])
  return null
}

const clock = (date: Date) => date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

export function Thread({
  messages,
  renderAssistant,
  startedAt,
  pending,
  className,
}: {
  messages: OpinionsUIMessage[]
  renderAssistant: (message: OpinionsUIMessage) => ReactNode
  startedAt?: string
  pending?: { text: string; card: ReactNode }
  className?: string
}) {
  const arrivals = useArrivals(messages.map((message) => message.id))
  const sources = sourcesByTurn(messages)
  const first = messages[0]
  const startDate = startedAt ? new Date(startedAt) : first ? arrivals.get(first.id) : undefined

  return (
    <MessageScrollerProvider autoScroll>
      <FollowOnSend lastUserId={pending ? PENDING_ID : messages.findLast((message) => message.role === 'user')?.id} />
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
                    <UserTurn message={message} sources={sources.get(message.id)} />
                  ) : (
                    <AssistantTurn time={arrived && clock(arrived)}>{renderAssistant(message)}</AssistantTurn>
                  )}
                </MessageScrollerItem>
              )
            })}
            {pending && (
              <>
                <MessageScrollerItem key={PENDING_ID} className={cn('[content-visibility:visible]', ENTER)}>
                  <UserTurn message={{ id: PENDING_ID, role: 'user', parts: [{ type: 'text', text: pending.text }] }} />
                </MessageScrollerItem>
                <MessageScrollerItem className={cn('flex flex-col gap-4 [content-visibility:visible]', ENTER)}>
                  <AssistantTurn>{pending.card}</AssistantTurn>
                </MessageScrollerItem>
              </>
            )}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton variant="outline" size="icon-sm" className="bottom-4 rounded-full shadow-sm" />
      </MessageScroller>
    </MessageScrollerProvider>
  )
}
