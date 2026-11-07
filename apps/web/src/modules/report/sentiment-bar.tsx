import type { Split } from '@xo/engine/parts'
import { cn } from '@/lib/utils'
import { splitLabel, splitSegments, splitTotal } from './format'

const COLOURS = { positive: 'bg-success', neutral: 'bg-muted-foreground/40', negative: 'bg-destructive' } as const

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
  const label = splitLabel(split)
  const segments = splitSegments(split)

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div role="img" aria-label={label} className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
        {total > 0 &&
          segments
            .filter((s) => s.count > 0)
            .map((s) => (
              <div
                key={s.key}
                data-segment={s.key}
                className={cn('h-full', COLOURS[s.key])}
                style={{ width: `${s.share * 100}%` }}
              />
            ))}
      </div>
      {legend && total > 0 && (
        <ul aria-hidden="true" className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground tabular-nums">
          {segments.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span className={cn('size-2 rounded-full', COLOURS[s.key])} />
              {s.legend}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
