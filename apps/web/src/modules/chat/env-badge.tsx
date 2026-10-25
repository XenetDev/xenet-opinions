import { Badge } from '@/components/ui/badge'
import { useAnnounce } from './notice-region'
import type { EnvStatus } from './use-env-status'

const envText = ({ state, minutesLeft }: EnvStatus) => {
  if (state === 'none') return null
  if (state !== 'open') return 'Agents offline'
  return minutesLeft === null ? 'Agents available' : `Agents available for ${minutesLeft} min`
}

export function EnvBadge(status: EnvStatus) {
  const text = envText(status)
  const routed = useAnnounce(text)
  if (text === null) return null
  return (
    <Badge
      role={routed ? undefined : 'status'}
      variant={status.state === 'open' ? 'secondary' : 'outline'}
      className="mt-2 self-start"
    >
      {text}
    </Badge>
  )
}
