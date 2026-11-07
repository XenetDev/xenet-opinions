import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { longDate } from '@/modules/report/export/meta'
import { SharedReport } from '@/modules/report/shared-report'
import { loadSharedReport } from '@/server/share'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Shared report',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default async function SharedReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const report = await loadSharedReport(token)
  if (!report) notFound()
  return (
    <SharedReport
      title={report.title}
      date={report.date}
      dateLabel={longDate(new Date(report.date))}
      summary={report.summary}
    />
  )
}
