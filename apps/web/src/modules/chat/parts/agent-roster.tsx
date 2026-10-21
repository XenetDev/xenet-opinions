'use client'

import { useState } from 'react'
import type { AgentsData } from '@xo/engine/parts'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'

type Profile = AgentsData['profiles'][number]

function initials(name: string): string {
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
  const heading = data.expected === undefined ? `${data.count} personas` : `${data.count} of ${data.expected} personas`

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium">{heading}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {data.profiles.map((profile) => (
          <button
            key={profile.id}
            type="button"
            data-testid="agent-card"
            onClick={() => setSelected(profile)}
            className="flex items-center gap-2 rounded-md border p-2 text-left hover:bg-muted"
          >
            <Avatar>
              <AvatarFallback>{initials(profile.name)}</AvatarFallback>
            </Avatar>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium">{profile.name}</span>
              {profile.role && <span className="truncate text-xs text-muted-foreground">{profile.role}</span>}
            </span>
          </button>
        ))}
      </div>
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
    </div>
  )
}
