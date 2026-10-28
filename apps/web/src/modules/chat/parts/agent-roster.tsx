'use client'

import type { AgentsData } from '@xo/engine/parts'
import { InfoIcon } from 'lucide-react'
import { useState } from 'react'
import { Frame, FrameHeader, FramePanel, FrameTitle } from '@/components/reui/frame'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { useInterviewSelection } from '../interview-selection'
import { useAnnounce } from '../notice-region'

type Profile = AgentsData['profiles'][number]

export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase())
      .join('') || '?'
  )
}

export function AgentRoster({ data }: { data: AgentsData }) {
  const [selected, setSelected] = useState<Profile | null>(null)
  const [fullHint, setFullHint] = useState(false)
  const selection = useInterviewSelection()
  const selectable = selection?.enabled === true
  const hint = selectable && fullHint ? `Up to ${selection.max} personas per interview` : null
  const routed = useAnnounce(hint)
  const heading = data.expected === undefined ? `${data.count} personas` : `${data.count} of ${data.expected} personas`

  return (
    <Frame spacing="sm" className="w-full">
      <FrameHeader>
        <FrameTitle className="font-medium">{heading}</FrameTitle>
      </FrameHeader>
      <FramePanel className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {data.profiles.map((profile) => {
            const pressed = selectable && selection.isSelected(profile.id)
            const card = (
              <button
                key={profile.id}
                type="button"
                data-testid="agent-card"
                aria-pressed={selectable ? pressed : undefined}
                onClick={() => {
                  if (!selectable) return setSelected(profile)
                  setFullHint(selection.toggle(profile) === 'full')
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md border p-2 text-left hover:bg-muted',
                  selectable && 'pr-8',
                  pressed && 'border-primary bg-muted',
                )}
              >
                <Avatar>
                  <AvatarFallback>{initials(profile.name)}</AvatarFallback>
                </Avatar>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">{profile.name}</span>
                  {profile.role && <span className="truncate text-xs text-muted-foreground">{profile.role}</span>}
                </span>
              </button>
            )
            if (!selectable) return card
            return (
              <div key={profile.id} className="relative flex">
                {card}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`About ${profile.name}`}
                  className="absolute top-1 right-1"
                  onClick={() => setSelected(profile)}
                >
                  <InfoIcon />
                </Button>
              </div>
            )
          })}
        </div>
        {hint && (
          <p role={routed ? undefined : 'status'} className="text-xs text-muted-foreground">
            {hint}
          </p>
        )}
      </FramePanel>
      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{selected?.name}</SheetTitle>
            <SheetDescription>{selected?.role ?? selected?.handle ?? 'Persona'}</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-3 px-4">
            {selected?.bio && <p className="text-sm">{selected.bio}</p>}
            {selected && selected.topics.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selected.topics.map((topic) => (
                  <Badge key={topic} variant="secondary">
                    {topic}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </Frame>
  )
}
