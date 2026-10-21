'use client'

import type { SimFeedData } from '@xo/engine/parts'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const FEED_LIMIT = 50

type Platform = SimFeedData['posts'][number]['platform']

const PLATFORMS: { value: Platform; label: string }[] = [
  { value: 'twitter', label: 'Twitter' },
  { value: 'reddit', label: 'Reddit' },
]

export function SimulationFeed({ data }: { data: SimFeedData }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium">{`Round ${data.round} of ${data.totalRounds}`}</p>
      <Tabs defaultValue="twitter">
        <TabsList>
          {PLATFORMS.map(({ value, label }) => (
            <TabsTrigger key={value} value={value}>
              {`${label} · ${value === 'twitter' ? data.twitterActs : data.redditActs}`}
            </TabsTrigger>
          ))}
        </TabsList>
        {PLATFORMS.map(({ value }) => {
          const posts = data.posts.filter((post) => post.platform === value).slice(-FEED_LIMIT)
          return (
            <TabsContent key={value} value={value}>
              <ScrollArea className="h-64 rounded-md border">
                <ul className="flex flex-col divide-y">
                  {posts.map((post) => (
                    <li key={post.id} data-testid="feed-post" className="flex flex-col gap-0.5 p-3">
                      <span className="text-xs text-muted-foreground">{`${post.agent} · round ${post.round}`}</span>
                      <span className="text-sm">{post.content}</span>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            </TabsContent>
          )
        })}
      </Tabs>
    </div>
  )
}
