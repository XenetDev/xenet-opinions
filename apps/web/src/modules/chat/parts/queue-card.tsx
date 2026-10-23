import { Clock3Icon } from 'lucide-react'
import type { QueueData } from '@xo/engine/parts'

export function QueueCard({ data }: { data: QueueData }) {
  return (
    <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
      <Clock3Icon aria-hidden className="size-4" />
      <span>{`You are #${data.position} in the queue`}</span>
    </div>
  )
}
