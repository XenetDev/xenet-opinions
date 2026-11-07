import { type Action, NO_VIEW, NOT_CLASSIFIED, type Participant, type ReportSummary } from '@xo/engine/parts'

export const PEOPLE_ONLY_HINT = 'Counts people only; this panel has none with a view'

export const formatSentiment = (value: number | null) => {
  if (value === null) return '—'
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${Math.abs(value).toFixed(1)}`
}

export const formatScore = (value: number) => (value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : '0')

export const formatShare = (value: number | null) => (value === null ? '—' : `${Math.round(value * 100)}%`)

export const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

export const splitTotal = (split: ReportSummary['split']) => split.positive + split.neutral + split.negative

export const ofPeople = (count: number | undefined, counted: number | undefined) =>
  count !== undefined && counted ? `${count} of ${counted} people` : undefined

export const uniqueBy = <T>(items: T[], key: (item: T) => string) => {
  const seen = new Set<string>()
  return items.filter((item) => {
    const k = key(item)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

export const groupLabels = (summary: ReportSummary) => new Map(summary.groups.map((g) => [g.id, g.label]))

export const ACTION_LABELS: Record<Action, string | null> = {
  act: 'Would go ahead',
  not_act: 'Would not go ahead',
  unsure: 'Unsure',
  'n/a': null,
}

export const CONFIDENCE_LABELS = { low: 'Low', medium: 'Medium', high: 'High' } as const

export const isWebUrl = (url: string) => {
  try {
    const { protocol } = new URL(url)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

export const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export type ExportKind = 'pdf' | 'docx' | 'xlsx'

export const EXPORTS: { kind: ExportKind; label: string }[] = [
  { kind: 'pdf', label: 'PDF' },
  { kind: 'docx', label: 'Word' },
  { kind: 'xlsx', label: 'Excel' },
]

export const SPLIT_SEGMENTS = [
  { key: 'positive', label: 'Positive' },
  { key: 'neutral', label: 'Neutral' },
  { key: 'negative', label: 'Negative' },
] as const

export const splitSegments = (split: ReportSummary['split']) => {
  const total = splitTotal(split)
  return SPLIT_SEGMENTS.map((s) => {
    const count = split[s.key]
    const percent = total ? Math.round((count / total) * 100) : 0
    return { ...s, count, share: total ? count / total : 0, legend: `${s.label} ${count} (${percent}%)` }
  })
}

export const splitLabel = (split: ReportSummary['split']) => {
  const total = splitTotal(split)
  return total
    ? `Sentiment split: ${split.positive} positive, ${split.neutral} neutral, ${split.negative} negative of ${total}`
    : 'Sentiment split: no views expressed'
}

export const reportMetaLine = (method: ReportSummary['method']) =>
  `Simulated focus group · ${method.participants} participants · ${method.groups} groups · ${method.rounds} rounds`

export const basisNote = (summary: ReportSummary) =>
  `Based on ${summary.method.participants} participants${summary.sources.length ? ` and ${summary.sources.length} web sources` : ''}`

export const topConcernNote = (summary: ReportSummary) =>
  summary.headline.topConcern
    ? `raised by ${summary.headline.topConcern.count} of ${splitTotal(summary.split)}`
    : 'No shared concern'

export const methodNote = (method: ReportSummary['method']) =>
  `${method.participants} AI participants in ${method.groups} groups discussed the question over ${method.rounds} rounds, then each answered a closing interview${method.webResearch ? '. Personas drew on web research' : ''}. This is a simulation: use it alongside, not instead of, research with real people for final decisions.`

export const WRITEUP_EMPTY = 'No written analysis for this run.'

export const sourcesEmptyNote = (method: ReportSummary['method']) =>
  method.webResearch ? 'Web research found no sources for this run.' : 'Web research was off for this run.'

export const participantDetails = (participant: Participant, group?: string) =>
  [participant.age !== undefined ? String(participant.age) : null, participant.location, participant.role, group]
    .filter(Boolean)
    .join(' · ')

export const participantSentiment = (participant: Participant) =>
  participant.sentiment === null ? NO_VIEW : `Sentiment ${formatScore(participant.sentiment)}`

export const participantAction = (participant: Participant) =>
  participant.sentiment === null ? null : ACTION_LABELS[participant.action]

export const participantOpinion = (participant: Participant) =>
  participant.opinion && participant.opinion !== NO_VIEW && participant.opinion !== NOT_CLASSIFIED
    ? participant.opinion
    : null
