import type { ReportSummary } from '@xo/engine/parts'
import type { ReactNode } from 'react'
import { Badge } from '@/components/reui/badge'
import {
  basisNote,
  CONFIDENCE_LABELS,
  capitalise,
  formatSentiment,
  methodNote,
  ofPeople,
  topConcernNote,
  uniqueBy,
} from './format'
import { SentimentBar } from './sentiment-bar'
import { Quote, ShareValue } from './values'

const LABEL = 'text-xs font-medium text-muted-foreground'

function Tile({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border bg-card p-3">
      <dt className={LABEL}>{label}</dt>
      <dd className="text-xl font-semibold text-foreground tabular-nums">{value}</dd>
      {note && <dd className="text-xs text-muted-foreground">{note}</dd>}
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  )
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border bg-card p-3">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {items.length ? (
        <ul className="list-disc ps-4 text-sm/6 text-foreground">
          {uniqueBy(items, (item) => item).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">None raised.</p>
      )}
    </div>
  )
}

export function SummaryTab({ summary }: { summary: ReportSummary }) {
  const { headline } = summary

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2 rounded-xl border bg-card p-4">
        <h3 className={LABEL}>Verdict</h3>
        <p className="text-base font-semibold text-foreground text-pretty">{summary.verdict}</p>
        <p className="text-sm text-muted-foreground">{summary.confidence.reason}</p>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="font-normal">
            {`Confidence: ${CONFIDENCE_LABELS[summary.confidence.level]}`}
          </Badge>
          <Badge variant="outline" className="font-normal">
            {basisNote(summary)}
          </Badge>
        </div>
      </section>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Overall sentiment" value={formatSentiment(headline.sentiment)} note="on a −5 to +5 scale" />
        <Tile
          label="Would go ahead"
          value={<ShareValue value={headline.actShare} />}
          note={ofPeople(headline.actCount, headline.counted)}
        />
        <Tile
          label="Would not go ahead"
          value={<ShareValue value={headline.switchShare} />}
          note={ofPeople(headline.switchCount, headline.counted)}
        />
        <Tile
          label="Top concern"
          value={<span className="text-base">{headline.topConcern ? capitalise(headline.topConcern.label) : '—'}</span>}
          note={topConcernNote(summary)}
        />
      </dl>

      <Section title="Sentiment split">
        <SentimentBar split={summary.split} legend />
      </Section>

      {summary.findings.length > 0 && (
        <Section title="Key findings">
          <ol className="list-decimal space-y-3 ps-5 text-sm/6 text-foreground">
            {summary.findings.map((finding, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: findings have no id and keep their order
              <li key={i} className="space-y-1.5 ps-1">
                <p>
                  <span className="font-semibold">{finding.title}</span> {finding.detail}
                </p>
                {finding.quote && <Quote cite={finding.quote.name}>{finding.quote.text}</Quote>}
              </li>
            ))}
          </ol>
        </Section>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <List title="Risks" items={summary.risks} />
        <List title="Opportunities" items={summary.opportunities} />
      </div>

      <Section title="How this was run">
        <p className="text-sm/6 text-muted-foreground">{methodNote(summary.method)}</p>
      </Section>
    </div>
  )
}
