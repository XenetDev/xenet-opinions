'use client'

import type { ReportSummary } from '@xo/engine/parts'
import { ExportButtons } from './export-buttons'
import { reportMetaLine } from './format'
import { useReportExport } from './report-section'
import { ReportView } from './report-view'

const BYLINE = 'Simulated focus group by Xenet Opinions'

export function SharedReport({
  title,
  date,
  dateLabel,
  summary,
}: {
  title: string
  date: string
  dateLabel: string
  summary: ReportSummary
}) {
  const exports = useReportExport(summary, title, date)
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex flex-col gap-3">
        <p className="text-xs font-medium text-muted-foreground">{BYLINE}</p>
        <h1 className="text-xl font-semibold text-balance sm:text-2xl">{title}</h1>
        <p className="text-xs text-muted-foreground">
          {dateLabel} · {reportMetaLine(summary.method)}
        </p>
        <div className="flex flex-wrap gap-2">
          <ExportButtons {...exports} only={['pdf']} />
        </div>
      </header>
      <main className="min-w-0">
        <h2 className="sr-only">Report</h2>
        <ReportView summary={summary} writeup contentClassName="pt-4" />
      </main>
      <footer className="mt-auto border-t pt-4 text-xs text-muted-foreground text-pretty">
        {BYLINE}. Participants are AI personas, not real people.
      </footer>
    </div>
  )
}
