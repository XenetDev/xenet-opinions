'use client'

import { type ReportSummary, ReportSummarySchema } from '@xo/engine/parts'
import { type ReactNode, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { ReportCard } from './report-card'
import { ReportSheet } from './report-sheet'

const RETRY_ERRORS: Record<string, string> = {
  summary_unavailable: 'Summaries are not available right now.',
  summary_running: 'A summary is already being built. Check back in a minute.',
  summary_exists: 'A summary already exists. Reload the page to see it.',
  run_not_done: 'The run has not finished yet.',
}
const RETRY_FAILED = 'The summary could not be built. Try again.'

export function ReportBlock({ summary, chatId, title }: { summary: ReportSummary; chatId?: string; title?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <ReportCard summary={summary} onOpen={() => setOpen(true)} />
      {chatId ? (
        <ReportSheet summary={summary} open={open} onOpenChange={setOpen} chatId={chatId} title={title} />
      ) : (
        <ReportSheet summary={summary} open={open} onOpenChange={setOpen} readOnly title={title} />
      )}
    </>
  )
}

export function RetrySummary({ chatId, onSummary }: { chatId: string; onSummary: (summary: ReportSummary) => void }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const retry = async () => {
    setPending(true)
    setError(null)
    const response = await fetch(`/api/chats/${chatId}/run/summary`, { method: 'POST' }).catch(() => null)
    const body = (await response?.json().catch(() => null)) as { summary?: unknown; error?: string } | null
    const parsed = response?.status === 201 ? ReportSummarySchema.safeParse(body?.summary) : null
    setPending(false)
    if (parsed?.success) onSummary(parsed.data)
    else setError((body?.error && RETRY_ERRORS[body.error]) || RETRY_FAILED)
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-dashed px-3 py-2.5 text-sm">
      <p className="text-muted-foreground">The structured summary for this report could not be built.</p>
      <Button size="sm" variant="outline" className="ms-auto" disabled={pending} onClick={() => void retry()}>
        {pending && (
          <Spinner
            role="presentation"
            aria-label={undefined}
            aria-hidden="true"
            className="motion-reduce:animate-none"
          />
        )}
        {pending ? 'Building summary…' : 'Retry summary'}
      </Button>
      <p role="status" className="w-full text-xs text-muted-foreground empty:hidden">
        {error}
      </p>
    </div>
  )
}

export function ReportSection({
  summary,
  failed,
  chatId,
  title,
  children,
}: {
  summary?: ReportSummary
  failed: boolean
  chatId?: string
  title?: string
  children: ReactNode
}) {
  const [retried, setRetried] = useState<ReportSummary | null>(null)
  const current = summary ?? retried
  if (current)
    return (
      <div data-part="report">
        <ReportBlock summary={current} chatId={chatId} title={title} />
      </div>
    )
  return (
    <>
      {children}
      {failed && chatId && (
        <div data-part="summary-retry">
          <RetrySummary chatId={chatId} onSummary={setRetried} />
        </div>
      )}
    </>
  )
}
