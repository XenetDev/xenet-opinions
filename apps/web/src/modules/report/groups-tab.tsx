import { type ReportSummary, SENTIMENT_MAX } from '@xo/engine/parts'
import { cn } from '@/lib/utils'
import { formatSentiment } from './format'
import { ShareValue } from './values'

function SentimentMeter({ value }: { value: number | null }) {
  if (value === null) return null
  const width = (Math.abs(value) / SENTIMENT_MAX) * 50
  return (
    <div aria-hidden="true" className="relative h-1.5 w-16 rounded-full bg-muted">
      <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
      <div
        className={cn(
          'absolute inset-y-0 rounded-full',
          value >= 0 ? 'left-1/2 bg-success' : 'right-1/2 bg-destructive',
        )}
        style={{ width: `${width}%` }}
      />
    </div>
  )
}

export function GroupsTab({ summary }: { summary: ReportSummary }) {
  if (!summary.groups.length) return <p className="text-sm text-muted-foreground">No groups in this run.</p>
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[520px] text-left text-sm">
        <caption className="sr-only">Results by group</caption>
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              Group
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              People
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Sentiment
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Would go ahead
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              What they say
            </th>
          </tr>
        </thead>
        <tbody>
          {summary.groups.map((group) => (
            <tr key={group.id} className="border-t align-top">
              <th scope="row" className="px-3 py-2.5 font-medium text-foreground">
                {group.label}
              </th>
              <td className="px-3 py-2.5 text-right tabular-nums">{group.people}</td>
              <td className="px-3 py-2.5">
                <div className="flex items-center gap-2 tabular-nums">
                  <span className="w-9">{formatSentiment(group.sentiment)}</span>
                  <SentimentMeter value={group.sentiment} />
                </div>
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                <ShareValue value={group.actShare} />
              </td>
              <td className="px-3 py-2.5 text-muted-foreground">{group.summary}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
