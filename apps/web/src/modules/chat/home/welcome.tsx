'use client'

import { CornerDownLeftIcon, MessageSquareIcon } from 'lucide-react'
import Link from 'next/link'
import { Badge } from '@/components/reui/badge'
import { Button } from '@/components/ui/button'
import { relativeTime } from '../relative-time'

export type RecentChat = { id: string; title: string; updatedAt: string; firstFile?: string }

const STARTERS = [
  'How will customers react to a 20% price increase on our Pro plan?',
  'What happens to public opinion if the city bans e-scooters downtown?',
  'How would employees respond to a return-to-office mandate?',
]

const RECENT_LIMIT = 4

export function Welcome({ recent, onUseStarter }: { recent: RecentChat[]; onUseStarter: (prompt: string) => void }) {
  const shortcuts = recent.slice(0, RECENT_LIMIT)
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="m-auto flex w-full max-w-2xl flex-col px-4 py-6 sm:px-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">Xenet Opinions</h1>
          <p className="text-sm text-muted-foreground">Ask how a group of people would react to a decision.</p>
        </div>
        <div className="mt-5 flex flex-col">
          {STARTERS.map((prompt) => (
            <Button
              key={prompt}
              type="button"
              variant="ghost"
              onClick={() => onUseStarter(prompt)}
              className="group/prompt h-auto w-full justify-start gap-3 rounded-none border-x-0 border-t-0 border-b border-border px-0 py-2.5 text-start font-normal whitespace-normal last:border-b-0 hover:bg-transparent"
            >
              <span className="min-w-0 flex-1">{prompt}</span>
              <CornerDownLeftIcon
                aria-hidden="true"
                className="size-4 shrink-0 opacity-40 transition-opacity group-hover/prompt:opacity-100"
              />
            </Button>
          ))}
        </div>
        {shortcuts.length > 0 && (
          <section className="-mx-2 mt-6 flex flex-col gap-1.5">
            <h2 className="px-2 text-xs font-medium text-muted-foreground">Recent chats</h2>
            <div className="flex flex-col">
              {shortcuts.map((chat) => (
                <Button
                  key={chat.id}
                  asChild
                  variant="ghost"
                  className="h-8 w-full justify-start gap-2.5 px-2 font-normal [&_svg]:size-3.5 [&_svg]:text-muted-foreground"
                >
                  <Link href={`/c/${chat.id}`}>
                    <MessageSquareIcon aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-start">{chat.title}</span>
                    {chat.firstFile && (
                      <Badge
                        variant="outline"
                        size="sm"
                        className="max-w-32 min-w-0 font-mono font-normal text-muted-foreground"
                      >
                        <span className="min-w-0 truncate">{chat.firstFile}</span>
                      </Badge>
                    )}
                    <span
                      suppressHydrationWarning
                      className="w-14 shrink-0 text-end text-xs text-muted-foreground tabular-nums"
                    >
                      {relativeTime(chat.updatedAt)}
                    </span>
                  </Link>
                </Button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
