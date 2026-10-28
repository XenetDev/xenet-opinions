'use client'

import type { OpinionsUIMessage } from '@xo/engine/parts'
import { ChevronRightIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Badge } from '@/components/reui/badge'
import { Frame, FrameFooter, FrameHeader, FramePanel, FrameTitle } from '@/components/reui/frame'
import { Button } from '@/components/ui/button'
import { Marker, MarkerIcon } from '@/components/ui/marker'
import { cn } from '@/lib/utils'
import { useAnnounce } from '../notice-region'
import { type ConsoleRow, type ConsoleStatus, deriveConsole } from './derive'
import { DoneRow, FailedRow, LABEL, LiveRow, QueuedRow, ROW_X } from './rows'

const TICK_MS = 30_000

const BADGES: Record<
  ConsoleStatus,
  {
    label: string
    variant: 'info-light' | 'warning-light' | 'success-light' | 'destructive-light' | 'secondary' | 'outline'
  }
> = {
  working: { label: 'Working', variant: 'info-light' },
  needs_you: { label: 'Needs you', variant: 'warning-light' },
  complete: { label: 'Complete', variant: 'success-light' },
  failed: { label: 'Failed', variant: 'destructive-light' },
  cancelled: { label: 'Cancelled', variant: 'secondary' },
  queued: { label: 'Queued', variant: 'outline' },
}

function countdown(until: string, now: number) {
  const minutes = Math.ceil((Date.parse(until) - now) / 60_000)
  if (minutes <= 0) return 'The window is closing'
  return minutes === 1 ? '1 minute left' : `${minutes} minutes left`
}

export function RunConsole({
  parts,
  chatId,
  title,
  windowUntil,
  reportRequested = false,
  windowLive = true,
  onCancelRun,
  onRetry,
}: {
  parts: OpinionsUIMessage['parts']
  chatId?: string
  title?: string
  windowUntil?: string | null
  reportRequested?: boolean
  windowLive?: boolean
  onCancelRun?: () => void
  onRetry?: () => void
}) {
  const [now, setNow] = useState(() => Date.now())
  const [requested, setRequested] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const model = deriveConsole(parts, { until: windowUntil, reportRequested, windowLive, now })
  const windowOpen = model.rows.some((row) => row.action === 'window')
  const windowPart = parts.findLast((part) => part.type === 'data-interview_window')
  const until = windowUntil ?? (windowPart?.type === 'data-interview_window' ? windowPart.data.until : null)
  const generating = windowOpen && (requested || reportRequested)
  const routedReport = useAnnounce(generating ? 'Generating report…' : null)
  const queueRow = model.status === 'queued' ? model.rows[0] : undefined
  const queueText = queueRow && [queueRow.title, queueRow.detail].filter(Boolean).join('. ')
  const routedQueue = useAnnounce(queueText ?? null)

  useEffect(() => {
    if (!windowOpen) return
    const timer = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(timer)
  }, [windowOpen])

  const requestReport = async () => {
    setRequested(true)
    const response = await fetch(`/api/chats/${chatId}/run/report`, { method: 'POST' }).catch(() => null)
    if (!response?.ok) setRequested(false)
  }

  const windowAction = (
    <div className="flex flex-col gap-2 pt-1">
      {until && (
        <p className="text-xs text-muted-foreground tabular-nums" suppressHydrationWarning>
          {countdown(until, now)}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Pick personas from the roster to interview them. Answers arrive one persona at a time, usually within a minute;
        a persona that does not answer within 4 minutes is marked failed.
      </p>
      {generating && (
        <p role={routedReport ? undefined : 'status'} className={cn('font-medium', LABEL)}>
          Generating report…
        </p>
      )}
      {((!generating && chatId) || onCancelRun) && (
        <div className="flex flex-wrap items-center gap-2">
          {!generating && chatId && (
            <Button type="button" size="sm" onClick={() => void requestReport()}>
              Generate report
            </Button>
          )}
          {onCancelRun && (
            <Button type="button" size="sm" variant="outline" onClick={onCancelRun}>
              Cancel run
            </Button>
          )}
        </div>
      )}
    </div>
  )

  const retryAction = onRetry && (
    <Button type="button" size="sm" variant="outline" onClick={onRetry}>
      Retry from here
    </Button>
  )

  const renderRow = (row: ConsoleRow) => {
    if (row.kind === 'done') return <DoneRow key={row.id} row={row} />
    if (row.kind === 'live')
      return (
        <LiveRow
          key={row.id}
          row={row}
          waiting={row.action === 'window'}
          action={row.action === 'window' ? windowAction : undefined}
        />
      )
    if (row.kind === 'failed' || row.kind === 'cancelled')
      return <FailedRow key={row.id} row={row} action={row.action === 'retry' ? retryAction : undefined} />
    return <QueuedRow key={row.id} row={row} announce={row === queueRow && !routedQueue} />
  }

  const doneCount = model.rows.filter((row) => row.kind === 'done').length
  const fold = model.folded && !expanded && doneCount > 0
  const firstDone = model.rows.findIndex((row) => row.kind === 'done')
  const badge = BADGES[model.status]

  return (
    <Frame dense stacked spacing="default" className="w-full" data-testid="run-console" data-status={model.status}>
      <FrameHeader className="flex-row items-center gap-2">
        <FrameTitle className="truncate">{title ?? 'Simulation run'}</FrameTitle>
        <Badge variant={badge.variant} className="ms-auto shrink-0 font-normal" data-testid="run-console-status">
          {badge.label}
        </Badge>
      </FrameHeader>
      <FramePanel className="flex flex-col p-0">
        {model.rows.map((row, index) => {
          if (!fold || row.kind !== 'done') return renderRow(row)
          if (index !== firstDone) return null
          return (
            <Marker
              key="fold"
              asChild
              className={cn(
                'cursor-pointer py-3 transition-colors hover:bg-muted/40 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset focus-visible:outline-none motion-reduce:transition-none',
                ROW_X,
              )}
            >
              <button type="button" aria-expanded={false} onClick={() => setExpanded(true)}>
                <MarkerIcon className="h-5 w-4" />
                <span className={cn(LABEL, 'font-medium leading-5 text-foreground')}>
                  {`Finished · ${doneCount} steps`}
                </span>
                <ChevronRightIcon aria-hidden className="ms-auto" />
              </button>
            </Marker>
          )
        })}
      </FramePanel>
      {model.step.n > 0 && (
        <FrameFooter className="flex-row items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground tabular-nums">
            {`Step ${model.step.n} of ${model.step.total}`}
          </span>
        </FrameFooter>
      )}
    </Frame>
  )
}
