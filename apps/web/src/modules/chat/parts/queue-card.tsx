import type { QueueData } from '@xo/engine/parts'
import { Clock3Icon } from 'lucide-react'
import { useAnnounce } from '../notice-region'

export function QueueCard({ data }: { data: QueueData }) {
  const position = `You are #${data.position} in the queue`
  const text = data.pausedAhead
    ? `${position}. A run is paused for interviews; yours starts when it finishes.`
    : position
  const routed = useAnnounce(text)
  return (
    <div role={routed ? undefined : 'status'} className="flex items-center gap-2 text-sm text-muted-foreground">
      <Clock3Icon aria-hidden className="size-4" />
      <span>{text}</span>
    </div>
  )
}
