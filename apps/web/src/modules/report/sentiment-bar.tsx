import type { Split } from '@xo/engine/parts'
import { cn } from '@/lib/utils'
import { splitTotal } from './format'

const SEGMENTS = [
  { key: 'positive', label: 'Positive', className: 'bg-success' },
  { key: 'neutral', label: 'Neutral', className: 'bg-muted-foreground/40' },
  { key: 'negative', label: 'Negative', className: 'bg-destructive' },
] as const

export function SentimentBar({
  split,
  legend = false,
  className,
}: {
  split: Split
  legend?: boolean
  className?: string
}) {
  const total = splitTotal(split)
  const label = total
    ? `Sentiment split: ${split.positive} positive, ${split.neutral} neutral, ${split.negative} negative of ${total}`
    : 'Sentiment split: no views expressed'

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div role="img" aria-label={label} className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
        {total > 0 &&
          SEGMENTS.filter((s) => split[s.key] > 0).map((s) => (
            <div
              key={s.key}
              data-segment={s.key}
              className={cn('h-full', s.className)}
              style={{ width: `${(split[s.key] / total) * 100}%` }}
            />
          ))}
      </div>
      {legend && total > 0 && (
        <ul aria-hidden="true" className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground tabular-nums">
          {SEGMENTS.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span className={cn('size-2 rounded-full', s.className)} />
              {`${s.label} ${split[s.key]} (${Math.round((split[s.key] / total) * 100)}%)`}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
