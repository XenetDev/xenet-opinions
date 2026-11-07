import type { ReportSummary } from '@xo/engine/parts'
import { Markdown } from '@/modules/chat/markdown'

export function WriteupTab({ summary }: { summary: ReportSummary }) {
  if (!summary.writeup.trim()) return <p className="text-sm text-muted-foreground">No written analysis for this run.</p>
  return <Markdown className="text-sm/6 sm:text-[15px]/6">{summary.writeup}</Markdown>
}
