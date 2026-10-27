'use client'

import type { InterviewWindowData } from '@xo/engine/parts'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useAnnounce } from '../notice-region'

const TICK_MS = 30_000

const REASONS: Record<NonNullable<InterviewWindowData['reason']>, string> = {
  report_requested: 'Report requested',
  expired: 'The interview window ended',
  environment_stopped: 'The simulation environment stopped',
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

function countdown(until: string, now: number) {
  const minutes = Math.ceil((Date.parse(until) - now) / 60_000)
  if (minutes <= 0) return 'The window is closing'
  return minutes === 1 ? '1 minute left' : `${minutes} minutes left`
}

export function InterviewWindowCard({
  data,
  chatId,
  until: liveUntil,
  reportRequested = false,
  live = true,
  onCancel,
}: {
  data: InterviewWindowData
  chatId?: string
  until?: string | null
  reportRequested?: boolean
  live?: boolean
  onCancel?: () => void
}) {
  const [now, setNow] = useState(() => Date.now())
  const [requested, setRequested] = useState(false)
  const open = !data.closed && live
  const until = liveUntil ?? data.until
  const generating = open && (requested || reportRequested)
  const routed = useAnnounce(generating ? 'Generating report…' : null)

  useEffect(() => {
    if (!open) return
    const timer = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(timer)
  }, [open])

  const requestReport = async () => {
    setRequested(true)
    const response = await fetch(`/api/chats/${chatId}/run/report`, { method: 'POST' }).catch(() => null)
    if (!response?.ok) setRequested(false)
  }

  if (!open) {
    const offlineReason = data.closed ? data.reason && REASONS[data.reason] : 'The run ended'
    return (
      <div className="flex flex-col gap-1 rounded-md border p-3" data-testid="interview-window" data-state="closed">
        <p className="text-sm font-medium">Personas offline</p>
        {offlineReason && <p className="text-sm text-muted-foreground">{offlineReason}</p>}
      </div>
    )
  }

  const personas =
    data.personaCount === 0
      ? 'Personas are'
      : data.personaCount === 1
        ? '1 persona is'
        : `${data.personaCount} personas are`
  return (
    <div className="flex flex-col gap-2 rounded-md border p-3" data-testid="interview-window" data-state="open">
      <p className="text-sm font-medium" suppressHydrationWarning>
        {until ? `${personas} online until ${clock(until)}` : `${personas} online`}
      </p>
      {until && (
        <p className="text-sm text-muted-foreground" suppressHydrationWarning>
          {countdown(until, now)}
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        Pick personas from the roster to interview them; answers take about 3 minutes per persona.
      </p>
      {generating && (
        <p role={routed ? undefined : 'status'} className="text-sm">
          Generating report…
        </p>
      )}
      {((!generating && chatId) || onCancel) && (
        <div className="flex flex-wrap gap-2">
          {!generating && chatId && (
            <Button type="button" size="sm" onClick={() => void requestReport()}>
              Generate report
            </Button>
          )}
          {onCancel && (
            <Button type="button" size="sm" variant="outline" onClick={onCancel}>
              Cancel run
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
