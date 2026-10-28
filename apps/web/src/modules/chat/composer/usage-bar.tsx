import { ActivityIcon } from 'lucide-react'
import { FrameHeader } from '@/components/reui/frame'
import { Progress } from '@/components/ui/progress'
import type { Usage } from '@/server/usage-from'

const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

export function UsageBar({ usage }: { usage: Usage }) {
  const left = Math.max(usage.max - usage.used, 0)
  const summary = `${usage.used} of ${usage.max} runs used today`
  const detail =
    left === 0 && usage.resetAt
      ? `No runs left until ${clock(usage.resetAt)}`
      : usage.resetAt
        ? `Resets at ${clock(usage.resetAt)}`
        : null
  return (
    <FrameHeader
      data-testid="usage-bar"
      className="flex-col items-stretch gap-2 rounded-t-[calc(var(--frame-radius)-1px)] bg-muted/40"
    >
      <div className="flex min-w-0 items-center gap-1.5 text-muted-foreground text-xs">
        <ActivityIcon className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">
          <span className="tabular-nums">{summary}</span>
          {detail && (
            <>
              <span
                aria-hidden="true"
                className="mx-1.5 inline-block size-1 rounded-full bg-muted-foreground/40 align-middle"
              />
              <span suppressHydrationWarning>{detail}</span>
            </>
          )}
        </span>
      </div>
      <Progress
        value={usage.max ? Math.round((usage.used / usage.max) * 100) : 0}
        aria-label="Runs used today"
        className="h-1.5 [&_[data-slot=progress-indicator]]:rounded-full [&_[data-slot=progress-track]]:h-1.5 [&_[data-slot=progress-track]]:bg-muted-foreground/15"
      />
    </FrameHeader>
  )
}
