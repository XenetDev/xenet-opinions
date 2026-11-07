import type { ReportSummary } from '@xo/engine/parts'
import { Markdown } from '@/modules/chat/markdown'
import { WRITEUP_EMPTY } from './format'

export function WriteupTab({ summary }: { summary: ReportSummary }) {
  if (!summary.writeup.trim()) return <p className="text-sm text-muted-foreground">{WRITEUP_EMPTY}</p>
  return <Markdown className="text-sm/6 sm:text-[15px]/6">{summary.writeup}</Markdown>
}
