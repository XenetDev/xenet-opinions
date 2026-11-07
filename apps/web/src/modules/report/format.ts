import type { Action, ReportSummary } from '@xo/engine/parts'

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

export const countedPeople = (summary: ReportSummary) =>
  summary.participants.filter((p) => p.kind === 'person' && p.sentiment !== null && p.action !== 'n/a')

export const countOf = (summary: ReportSummary, action: Action) =>
  countedPeople(summary).filter((p) => p.action === action).length

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
