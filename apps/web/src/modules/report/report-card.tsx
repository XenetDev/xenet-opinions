import type { ReportSummary } from '@xo/engine/parts'
import type { ReactNode } from 'react'
import { Badge } from '@/components/reui/badge'
import { Frame, FrameFooter, FrameHeader, FramePanel, FrameTitle } from '@/components/reui/frame'
import { Button } from '@/components/ui/button'
import { CONFIDENCE_LABELS, EXPORTS, type ExportKind, formatSentiment } from './format'
import { SentimentBar } from './sentiment-bar'
import { ShareValue } from './values'

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div data-testid="report-card-stat" className="flex items-baseline gap-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground tabular-nums">{children}</span>
    </div>
  )
}

export function ReportCard({
  summary,
  onOpen,
  onExport,
}: {
  summary: ReportSummary
  onOpen: () => void
  onExport?: (kind: ExportKind) => void
}) {
  const { headline, method, sources } = summary
  const meta = [
    'Report ready',
    `${method.participants} participants`,
    ...(sources.length ? [`${sources.length} sources`] : []),
  ].join(' · ')

  return (
    <section aria-label="Report summary" data-testid="report-card">
      <Frame dense stacked spacing="default" className="w-full">
        <FrameHeader className="flex-row items-center gap-2">
          <FrameTitle className="truncate text-xs font-normal text-muted-foreground">{meta}</FrameTitle>
          <Badge variant="outline" className="ms-auto shrink-0 font-normal">
            {`Confidence: ${CONFIDENCE_LABELS[summary.confidence.level]}`}
          </Badge>
        </FrameHeader>
        <FramePanel className="flex flex-col gap-3">
          <p className="text-[15px]/6 font-medium text-foreground text-pretty">{summary.verdict}</p>
          <SentimentBar split={summary.split} />
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
            <Stat label="Sentiment">{formatSentiment(headline.sentiment)}</Stat>
            <Stat label="Would go ahead">
              <ShareValue value={headline.actShare} />
            </Stat>
            <Stat label="Would not go ahead">
              <ShareValue value={headline.switchShare} />
            </Stat>
          </div>
        </FramePanel>
        <FrameFooter className="flex-row flex-wrap items-center gap-2">
          <Button size="sm" onClick={onOpen}>
            Open report
          </Button>
          {EXPORTS.map(({ kind, label }) => (
            <Button
              key={kind}
              size="sm"
              variant="outline"
              disabled={!onExport}
              onClick={onExport ? () => onExport(kind) : undefined}
            >
              {label}
            </Button>
          ))}
        </FrameFooter>
      </Frame>
    </section>
  )
}
