import type { ReportSummary } from '@xo/engine/parts'
import { hostOf, isWebUrl, sourcesEmptyNote, uniqueBy } from './format'

export function SourcesTab({ summary }: { summary: ReportSummary }) {
  if (!summary.sources.length)
    return <p className="text-sm text-muted-foreground">{sourcesEmptyNote(summary.method)}</p>
  return (
    <ol className="flex flex-col divide-y rounded-lg border">
      {uniqueBy(summary.sources, (source) => source.url).map((source) => (
        <li key={source.url} className="flex flex-col gap-0.5 px-3 py-2.5">
          {isWebUrl(source.url) ? (
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-foreground underline-offset-2 hover:underline"
            >
              {source.title || hostOf(source.url)}
            </a>
          ) : (
            <span className="text-sm font-medium text-foreground">{source.title}</span>
          )}
          <span className="truncate text-xs text-muted-foreground">{hostOf(source.url)}</span>
        </li>
      ))}
    </ol>
  )
}
