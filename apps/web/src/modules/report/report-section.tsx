'use client'

import { type ReportSummary, ReportSummarySchema } from '@xo/engine/parts'
import { type ReactNode, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { runExport } from './export/run'
import { EXPORTS, type ExportKind } from './format'
import { ReportCard } from './report-card'
import { ReportSheet } from './report-sheet'

const RETRY_ERRORS: Record<string, string> = {
  summary_unavailable: 'Summaries are not available right now.',
  summary_running: 'A summary is already being built. Check back in a minute.',
  summary_exists: 'A summary already exists. Reload the page to see it.',
  run_not_done: 'The run has not finished yet.',
}
const RETRY_FAILED = 'The summary could not be built. Try again.'

const exportFailed = (kind: ExportKind) =>
  `The ${EXPORTS.find((e) => e.kind === kind)?.label} file could not be created. Try again.`

export function useReportExport(summary: ReportSummary, title?: string, finishedAt?: string) {
  const [exporting, setExporting] = useState<ExportKind | null>(null)
  const onExport = async (kind: ExportKind) => {
    setExporting(kind)
    try {
      const meta = finishedAt
        ? { title: title ?? '', date: new Date(finishedAt) }
        : { title: title ?? '', date: new Date(), exported: true }
      await runExport(kind, summary, meta)
    } catch (error) {
      console.error('report export failed', { kind, error })
      toast(exportFailed(kind))
    } finally {
      setExporting(null)
    }
  }
  return { exporting, onExport: (kind: ExportKind) => void onExport(kind) }
}

export function ReportBlock({
  summary,
  chatId,
  messageId,
  shareUrl,
  title,
  finishedAt,
}: {
  summary: ReportSummary
  chatId?: string
  messageId?: string
  shareUrl?: string
  title?: string
  finishedAt?: string
}) {
  const [open, setOpen] = useState(false)
  const [liveUrl, setLiveUrl] = useState<string | null>(shareUrl ?? null)
  const exports = useReportExport(summary, title, finishedAt)
  return (
    <>
      <ReportCard summary={summary} onOpen={() => setOpen(true)} {...exports} exports={chatId ? undefined : ['pdf']} />
      {chatId ? (
        <ReportSheet
          summary={summary}
          open={open}
          onOpenChange={setOpen}
          chatId={chatId}
          messageId={messageId}
          shareUrl={liveUrl}
          onShareUrlChange={setLiveUrl}
          title={title}
          {...exports}
        />
      ) : (
        <ReportSheet summary={summary} open={open} onOpenChange={setOpen} readOnly title={title} {...exports} />
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
  messageId,
  shareUrl,
  title,
  finishedAt,
  children,
}: {
  summary?: ReportSummary
  failed: boolean
  chatId?: string
  messageId?: string
  shareUrl?: string
  title?: string
  finishedAt?: string
  children: ReactNode
}) {
  const [retried, setRetried] = useState<ReportSummary | null>(null)
  const current = summary ?? retried
  if (current)
    return (
      <div data-part="report">
        <ReportBlock
          summary={current}
          chatId={chatId}
          messageId={messageId}
          shareUrl={shareUrl}
          title={title}
          finishedAt={finishedAt}
        />
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
