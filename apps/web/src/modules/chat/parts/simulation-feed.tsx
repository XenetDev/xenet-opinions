'use client'

import type { AgentsData, SimFeedData } from '@xo/engine/parts'
import { type ComponentType, type SVGProps, useState } from 'react'
import { RedditIcon, XIcon } from '@/components/brand/platform-icons'
import { Badge } from '@/components/reui/badge'
import { Frame, FrameDescription, FrameHeader, FramePanel, FrameTitle } from '@/components/reui/frame'
import { Bubble, BubbleContent } from '@/components/ui/bubble'
import { Button } from '@/components/ui/button'
import { Message, MessageAvatar, MessageContent, MessageHeader } from '@/components/ui/message'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { initials } from './agent-roster'

const FEED_LIMIT = 50
const REPLY_LIMIT = 3

type Platform = SimFeedData['posts'][number]['platform']
type Reply = NonNullable<SimFeedData['replies']>[number]
type Profiles = AgentsData['profiles']

const PLATFORMS: { value: Platform; label: string; Icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { value: 'twitter', label: 'X.com', Icon: XIcon },
  { value: 'reddit', label: 'Reddit.com', Icon: RedditIcon },
]

export function personaLabel(agent: string, profiles: Profiles = []): { name: string; role?: string } {
  const profile = profiles.find((p) => p.id === agent) ?? profiles.find((p) => p.name === agent)
  return profile ? { name: profile.name, role: profile.role } : { name: `Persona ${agent}` }
}

function PostReplies({ replies, profiles }: { replies: Reply[]; profiles?: Profiles }) {
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? replies : replies.slice(0, REPLY_LIMIT)
  return (
    <ul className="ms-9 mt-2 flex flex-col gap-2">
      {shown.map((reply) => {
        const { name } = personaLabel(reply.agent, profiles)
        return (
          <li key={reply.id} data-testid="feed-reply">
            <Message>
              <MessageAvatar aria-hidden="true" className="size-5 min-w-5 self-start text-[9px] font-medium">
                {initials(name)}
              </MessageAvatar>
              <MessageContent className="gap-1">
                <MessageHeader className="px-0">{`${name} · replied`}</MessageHeader>
                <Bubble variant="outline" className="max-w-full">
                  <BubbleContent>{reply.content}</BubbleContent>
                </Bubble>
              </MessageContent>
            </Message>
          </li>
        )
      })}
      {replies.length > REPLY_LIMIT && (
        <li>
          <Button variant="ghost" size="xs" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
            {expanded ? 'Show fewer replies' : `+${replies.length - REPLY_LIMIT} more replies`}
          </Button>
        </li>
      )}
    </ul>
  )
}

export function SimulationFeed({ data, agents }: { data: SimFeedData; agents?: AgentsData }) {
  const profiles = agents?.profiles
  const repliesByPost = new Map<string, Reply[]>()
  for (const reply of data.replies ?? []) {
    const key = `${reply.platform}:${reply.postId}`
    repliesByPost.set(key, [...(repliesByPost.get(key) ?? []), reply])
  }
  return (
    <Tabs defaultValue="twitter" className="gap-0">
      <Frame spacing="sm" className="w-full">
        <FrameHeader className="flex-row flex-wrap items-center gap-2">
          <FrameTitle className="font-medium">Simulated feed</FrameTitle>
          <Badge variant="outline">{`Round ${data.round} of ${data.totalRounds}`}</Badge>
          <TabsList className="ms-auto">
            {PLATFORMS.map(({ value, label, Icon }) => (
              <TabsTrigger key={value} value={value}>
                <Icon className="size-3.5" />
                {`${label} · ${value === 'twitter' ? data.twitterActs : data.redditActs}`}
              </TabsTrigger>
            ))}
          </TabsList>
          <FrameDescription className="basis-full text-xs text-muted-foreground">
            Personas post and reply to each other on a simulated X.com and Reddit.com. Nothing here comes from the real
            sites.
          </FrameDescription>
        </FrameHeader>
        <FramePanel className="p-0">
          {PLATFORMS.map(({ value }) => {
            const posts = data.posts.filter((post) => post.platform === value).slice(-FEED_LIMIT)
            return (
              <TabsContent key={value} value={value}>
                <ScrollArea className="h-64">
                  <ul className="flex flex-col gap-3 p-3">
                    {posts.map((post) => {
                      const { name, role } = personaLabel(post.agent, profiles)
                      const replies = repliesByPost.get(`${post.platform}:${post.id}`)
                      return (
                        <li key={post.id} data-testid="feed-post">
                          <Message>
                            <MessageAvatar aria-hidden="true" className="size-7 self-start text-[11px] font-medium">
                              {initials(name)}
                            </MessageAvatar>
                            <MessageContent className="gap-1">
                              <MessageHeader className="px-0">
                                {[name, role, `round ${post.round}`].filter(Boolean).join(' · ')}
                              </MessageHeader>
                              <Bubble variant="outline" className="max-w-full">
                                <BubbleContent>{post.content}</BubbleContent>
                              </Bubble>
                            </MessageContent>
                          </Message>
                          {replies && <PostReplies replies={replies} profiles={profiles} />}
                        </li>
                      )
                    })}
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
