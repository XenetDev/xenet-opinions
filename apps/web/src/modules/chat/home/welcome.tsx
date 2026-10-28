'use client'

import { BikeIcon, BuildingIcon, MessageSquareIcon, TagIcon } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'

export type RecentChat = { id: string; title: string; updatedAt: string }

const STARTERS: { prompt: string; icon: ReactNode }[] = [
  { prompt: 'How will customers react to a 20% price increase on our Pro plan?', icon: <TagIcon aria-hidden="true" /> },
  {
    prompt: 'What happens to public opinion if the city bans e-scooters downtown?',
    icon: <BikeIcon aria-hidden="true" />,
  },
  { prompt: 'How would employees respond to a return-to-office mandate?', icon: <BuildingIcon aria-hidden="true" /> },
]

const DAY = 86_400_000
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()

export function relativeTime(iso: string, now = new Date()): string {
  const then = new Date(iso)
  const days = Math.round((startOfDay(now) - startOfDay(then)) / DAY)
  if (days <= 0) {
    const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000)
    if (minutes < 1) return 'just now'
    if (minutes < 60) return `${minutes} min`
    return `${Math.floor(minutes / 60)} h`
  }
  if (days === 1) return 'Yesterday'
  if (days < 7) return then.toLocaleDateString(undefined, { weekday: 'long' })
  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function Welcome({ recent, onUseStarter }: { recent: RecentChat[]; onUseStarter: (prompt: string) => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-6 sm:px-6">
      <div className="m-auto flex w-full max-w-3xl flex-col gap-8">
        <Empty className="flex-none gap-0 p-0">
          <EmptyHeader className="max-w-none items-center gap-2">
            <EmptyTitle className="text-2xl font-semibold tracking-tight sm:text-3xl">
              <h1>Xenet Opinions</h1>
            </EmptyTitle>
            <EmptyDescription className="text-sm">
              Ask how a group of people would react to a decision.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
        <div className="mx-auto flex w-full max-w-lg flex-col gap-5">
          <section className="flex flex-col gap-1">
            <h2 className="text-xs font-medium text-muted-foreground">Start</h2>
            <ul className="flex flex-col gap-2">
              {STARTERS.map((starter) => (
                <li key={starter.prompt}>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onUseStarter(starter.prompt)}
                    className="h-auto w-full justify-start gap-3 px-3 py-2.5 text-start font-normal whitespace-normal"
                  >
                    <span className="shrink-0 text-muted-foreground [&>svg]:size-4">{starter.icon}</span>
                    <span className="min-w-0 text-sm">{starter.prompt}</span>
                  </Button>
                </li>
              ))}
            </ul>
          </section>
          {recent.length > 0 && (
            <section className="flex flex-col gap-1">
              <h2 className="text-xs font-medium text-muted-foreground">Resume</h2>
              <ul className="flex flex-col">
                {recent.map((chat) => (
                  <li key={chat.id} className="min-w-0">
                    <Link
                      href={`/c/${chat.id}`}
                      className="group/resume flex w-full min-w-0 items-center gap-2 rounded-sm py-1 text-start outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      <MessageSquareIcon
                        aria-hidden="true"
                        className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover/resume:text-foreground"
                      />
                      <span className="min-w-0 truncate text-sm text-muted-foreground underline-offset-4 transition-colors group-hover/resume:text-foreground group-hover/resume:underline">
                        {chat.title}
                      </span>
                      <span suppressHydrationWarning className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {relativeTime(chat.updatedAt)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
