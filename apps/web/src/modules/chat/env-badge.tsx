import { Badge } from '@/components/ui/badge'
import type { EnvStatus } from './use-env-status'

export function EnvBadge({ state, minutesLeft }: EnvStatus) {
  if (state === 'none') return null
  return (
    <Badge role="status" variant={state === 'open' ? 'secondary' : 'outline'} className="mt-2 self-start">
      {state === 'open' ? (minutesLeft === null ? 'Agents available' : `Agents available for ${minutesLeft} min`) : 'Agents offline'}
    </Badge>
  )
}
