'use client'

import type { SimFeedData } from '@xo/engine/parts'
import { Frame, FrameHeader, FramePanel, FrameTitle } from '@/components/reui/frame'
import { Bubble, BubbleContent } from '@/components/ui/bubble'
import { Message, MessageAvatar, MessageContent, MessageHeader } from '@/components/ui/message'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { initials } from './agent-roster'

const FEED_LIMIT = 50

type Platform = SimFeedData['posts'][number]['platform']

const PLATFORMS: { value: Platform; label: string }[] = [
  { value: 'twitter', label: 'Twitter' },
  { value: 'reddit', label: 'Reddit' },
]

export function SimulationFeed({ data }: { data: SimFeedData }) {
  return (
    <Tabs defaultValue="twitter" className="gap-0">
      <Frame spacing="sm" className="w-full">
        <FrameHeader className="flex-row flex-wrap items-center gap-2">
          <FrameTitle className="font-medium">{`Round ${data.round} of ${data.totalRounds}`}</FrameTitle>
          <TabsList className="ms-auto">
            {PLATFORMS.map(({ value, label }) => (
              <TabsTrigger key={value} value={value}>
                {`${label} · ${value === 'twitter' ? data.twitterActs : data.redditActs}`}
              </TabsTrigger>
            ))}
          </TabsList>
        </FrameHeader>
        <FramePanel className="p-0">
          {PLATFORMS.map(({ value }) => {
            const posts = data.posts.filter((post) => post.platform === value).slice(-FEED_LIMIT)
            return (
              <TabsContent key={value} value={value}>
                <ScrollArea className="h-64">
                  <ul className="flex flex-col gap-3 p-3">
                    {posts.map((post) => (
                      <li key={post.id} data-testid="feed-post">
                        <Message>
                          <MessageAvatar aria-hidden="true" className="size-7 self-start text-[11px] font-medium">
                            {initials(post.agent)}
                          </MessageAvatar>
                          <MessageContent className="gap-1">
                            <MessageHeader className="px-0">{`${post.agent} · round ${post.round}`}</MessageHeader>
                            <Bubble variant="outline" className="max-w-full">
                              <BubbleContent>{post.content}</BubbleContent>
                            </Bubble>
                          </MessageContent>
                        </Message>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              </TabsContent>
            )
          })}
        </FramePanel>
      </Frame>
    </Tabs>
  )
}
