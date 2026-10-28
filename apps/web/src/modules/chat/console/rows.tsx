'use client'

import { BanIcon, CheckIcon, ChevronRightIcon, UsersIcon, XIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Badge } from '@/components/reui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Marker, MarkerContent, MarkerIcon } from '@/components/ui/marker'
import { Progress } from '@/components/ui/progress'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import type { ConsoleRow } from './derive'

export const ROW_X = 'px-(--frame-panel-px)'
export const LABEL = 'text-[13px]'
const TEXT_INDENT = 'ps-6'
const ENTER = 'animate-in fade-in-50 slide-in-from-bottom-1 duration-300 ease-out motion-reduce:animate-none'

const GLYPH_TONE = {
  live: 'text-foreground',
  waiting: 'text-success',
  done: 'text-muted-foreground',
  queued: 'text-muted-foreground',
  failed: 'text-destructive',
} as const

const QUEUED_RING = <span className="size-4 rounded-full border border-dashed border-current" />

const LIVE_SPINNER = (
  <Spinner role="presentation" aria-label={undefined} aria-hidden="true" className="motion-reduce:animate-none" />
)

const STATE_WORD: Record<ConsoleRow['kind'], string> = {
  done: 'Done',
  live: 'Running',
  queued: 'Pending',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

function StateWord({ kind }: { kind: ConsoleRow['kind'] }) {
  return <span className="sr-only">{STATE_WORD[kind]}</span>
}

export const formatClock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`

export function Glyph({
  children,
  tone = 'live',
  name,
}: {
  children: ReactNode
  tone?: keyof typeof GLYPH_TONE
  name: string
}) {
  return (
    <MarkerIcon
      data-glyph={name}
      className={cn('flex h-5 w-4 items-center justify-center self-start', GLYPH_TONE[tone])}
    >
      {children}
    </MarkerIcon>
  )
}

function StepClock({ seconds }: { seconds?: number }) {
  if (seconds === undefined || seconds < 1) return null
  return (
    <span className="flex h-5 shrink-0 items-center self-start text-xs text-muted-foreground tabular-nums">
      {formatClock(seconds)}
    </span>
  )
}

export function ServerChip({ name }: { name: string }) {
  return (
    <Badge variant="primary-light" className="shrink-0 font-mono font-normal">
      {name}
    </Badge>
  )
}

function childGlyph(row: ConsoleRow) {
  if (row.kind === 'live')
    return (
      <Glyph name="spinner" tone="live">
        {LIVE_SPINNER}
      </Glyph>
    )
  if (row.kind === 'done')
    return (
      <Glyph name="check" tone="done">
        <CheckIcon />
      </Glyph>
    )
  return (
    <Glyph name="queued" tone="queued">
      {QUEUED_RING}
    </Glyph>
  )
}

export function ToolRow({ row }: { row: ConsoleRow }) {
  const head = (
    <Marker className={cn(ENTER, 'items-start py-1')}>
      {childGlyph(row)}
      <MarkerContent
        className={cn('flex min-h-5 min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 leading-5', LABEL)}
      >
        {row.chip && <ServerChip name={row.chip} />}
        <span className={cn('min-w-0', row.kind === 'queued' ? 'text-muted-foreground' : 'text-foreground')}>
          {row.title}
        </span>
        <StateWord kind={row.kind} />
        {row.detail && (
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={`Show result of ${row.chip ?? row.title}`}
              className="group/note"
            >
              <ChevronRightIcon className="transition-transform group-data-[state=open]/note:rotate-90 motion-reduce:transition-none" />
            </Button>
          </CollapsibleTrigger>
        )}
      </MarkerContent>
      <StepClock seconds={row.seconds} />
    </Marker>
  )
  return (
    <Collapsible data-testid={row.chip ? 'tool-row' : 'section-row'} data-kind={row.kind}>
      {head}
      {row.detail && (
        <CollapsibleContent
          className={cn(
            TEXT_INDENT,
            'pb-1 text-xs leading-5 text-muted-foreground data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-1 motion-reduce:animate-none',
          )}
        >
          {row.detail}
        </CollapsibleContent>
      )}
      {row.children && <ChildRows rows={row.children} />}
    </Collapsible>
  )
}

function ChildRows({ rows }: { rows: ConsoleRow[] }) {
  return (
    <div className={cn(TEXT_INDENT, 'flex flex-col')}>
      {rows.map((row) => (
        <ToolRow key={row.id} row={row} />
      ))}
    </div>
  )
}

export function DoneRow({ row }: { row: ConsoleRow }) {
  return (
    <div data-kind="done" className={cn(ENTER, 'flex flex-col py-2', ROW_X)}>
      <Marker className="items-start">
        <Glyph name="check" tone="done">
          <CheckIcon />
        </Glyph>
        <MarkerContent className={cn('flex min-w-0 flex-1 flex-col gap-0.5', LABEL)}>
          <span className="leading-5 text-foreground">{row.title}</span>
          <StateWord kind="done" />
          {row.detail && <span className="text-xs leading-5 text-muted-foreground">{row.detail}</span>}
        </MarkerContent>
        <StepClock seconds={row.seconds} />
      </Marker>
      {row.children && <ChildRows rows={row.children} />}
    </div>
  )
}

export type BandMode = 'live' | 'waiting' | 'failed' | 'cancelled' | 'queued' | 'settled'

const BAND_GLYPH: Record<BandMode, ReactNode> = {
  live: <Glyph name="spinner">{LIVE_SPINNER}</Glyph>,
  waiting: (
    <Glyph name="waiting" tone="waiting">
      <UsersIcon />
    </Glyph>
  ),
  failed: (
    <Glyph name="failed" tone="failed">
      <XIcon />
    </Glyph>
  ),
  cancelled: (
    <Glyph name="cancelled" tone="queued">
      <BanIcon />
    </Glyph>
  ),
  queued: (
    <Glyph name="queued" tone="queued">
      {QUEUED_RING}
    </Glyph>
  ),
  settled: (
    <Glyph name="check" tone="done">
      <CheckIcon />
    </Glyph>
  ),
}

const BAND_KIND: Record<BandMode, ConsoleRow['kind']> = {
  live: 'live',
  waiting: 'live',
  failed: 'failed',
  cancelled: 'cancelled',
  queued: 'queued',
  settled: 'done',
}

export function LiveRow({ row, mode, action }: { row: ConsoleRow; mode: BandMode; action?: ReactNode }) {
  const kind = BAND_KIND[mode]
  const failed = mode === 'failed'
  return (
    <div
      data-kind={mode === 'settled' ? undefined : kind}
      data-band={mode}
      className={cn('flex flex-col gap-2 border-y border-border bg-muted/50 py-2.5', ROW_X)}
    >
      <Marker role="status" aria-live="polite" className="items-start">
        {BAND_GLYPH[mode]}
        <MarkerContent
          key={row.id}
          className={cn(
            'flex min-w-0 flex-1 flex-col gap-0.5 animate-in fade-in-50 slide-in-from-bottom-2 duration-300 ease-out motion-reduce:animate-none',
            LABEL,
          )}
        >
          <span
            className={cn(
              'font-medium leading-5',
              failed
                ? 'text-destructive'
                : mode === 'queued' || mode === 'cancelled'
                  ? 'text-muted-foreground'
                  : 'text-foreground',
              mode === 'live' && 'shimmer [--shimmer-duration:2.4s]',
            )}
          >
            {row.title}
          </span>
          <StateWord kind={kind} />
          {row.detail && (
            <span
              className={cn('text-sm leading-5', failed ? 'text-destructive' : 'text-muted-foreground')}
              suppressHydrationWarning
            >
              {row.detail}
            </span>
          )}
        </MarkerContent>
        {mode === 'live' && typeof row.percent === 'number' && (
          <span
            aria-hidden="true"
            className={cn('flex h-5 shrink-0 items-center self-start font-medium tabular-nums', LABEL)}
          >
            {row.percent}%
          </span>
        )}
      </Marker>
      {mode === 'live' && (
        <div className={TEXT_INDENT}>
          {typeof row.percent === 'number' ? (
            <Progress value={row.percent} aria-label={`${row.title} progress`} className="bg-muted-foreground/15" />
          ) : (
            <Progress
              value={null}
              aria-label={`${row.title} progress`}
              className="animate-pulse bg-muted-foreground/15 motion-reduce:animate-none"
            />
          )}
        </div>
      )}
      {row.children && <ChildRows rows={row.children} />}
      {action && <div className={TEXT_INDENT}>{action}</div>}
    </div>
  )
}

export function QueuedRow({ row }: { row: ConsoleRow }) {
  return (
    <div data-kind="queued" className={cn('flex flex-col py-2', ROW_X)}>
      <Marker className="items-start">
        <Glyph name="queued" tone="queued">
          {QUEUED_RING}
        </Glyph>
        <MarkerContent className={cn('flex min-w-0 flex-1 flex-col gap-0.5 leading-5', LABEL)}>
          <span className="text-muted-foreground">{row.title}</span>
          <StateWord kind="queued" />
          {row.detail && <span className="text-xs text-muted-foreground">{row.detail}</span>}
        </MarkerContent>
      </Marker>
      {row.children && <ChildRows rows={row.children} />}
    </div>
  )
}

export function FailedRow({ row, action }: { row: ConsoleRow; action?: ReactNode }) {
  const cancelled = row.kind === 'cancelled'
  return (
    <div data-kind={row.kind} className={cn(ENTER, 'flex flex-col gap-2 py-2', ROW_X)}>
      <Marker className="items-start">
        <Glyph name={cancelled ? 'cancelled' : 'failed'} tone={cancelled ? 'queued' : 'failed'}>
          {cancelled ? <BanIcon /> : <XIcon />}
        </Glyph>
        <MarkerContent className={cn('flex min-w-0 flex-1 flex-col gap-0.5', LABEL)}>
          <span className={cn('leading-5', cancelled ? 'text-muted-foreground' : 'text-destructive')}>{row.title}</span>
          <StateWord kind={row.kind} />
          {row.detail && (
            <span className={cn('text-xs leading-5', cancelled ? 'text-muted-foreground' : 'text-destructive')}>
              {row.detail}
            </span>
          )}
        </MarkerContent>
      </Marker>
      {row.children && <ChildRows rows={row.children} />}
      {action && <div className={TEXT_INDENT}>{action}</div>}
    </div>
  )
}
