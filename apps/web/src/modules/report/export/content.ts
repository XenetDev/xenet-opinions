import type { ReportSummary } from '@xo/engine/parts'
import {
  basisNote,
  CONFIDENCE_LABELS,
  capitalise,
  formatSentiment,
  formatShare,
  groupLabels,
  hostOf,
  isWebUrl,
  methodNote,
  ofPeople,
  PEOPLE_ONLY_HINT,
  participantAction,
  participantDetails,
  participantOpinion,
  participantSentiment,
  reportMetaLine,
  sourcesEmptyNote,
  splitLabel,
  splitSegments,
  splitTotal,
  topConcernNote,
  uniqueBy,
  WRITEUP_EMPTY,
} from '../format'
import { type Block, parseMarkdown } from './markdown'
import { type ExportMeta, longDate } from './meta'

export const SECTION_TITLES = {
  verdict: 'Verdict',
  headline: 'Headline numbers',
  split: 'Sentiment split',
  groups: 'Groups',
  findings: 'Key findings',
  risks: 'Risks and opportunities',
  participants: 'Participants',
  sources: 'Sources',
  method: 'How this was run',
  writeup: 'Full write-up',
} as const

export const GROUP_COLUMNS = ['Group', 'People', 'Sentiment', 'Would go ahead', 'What they say'] as const

const shareTile = (label: string, value: number | null, count: number | undefined, counted: number | undefined) => ({
  label,
  value: value === null ? '—' : formatShare(value),
  note: value === null ? PEOPLE_ONLY_HINT : ofPeople(count, counted),
})

export function reportDocument(summary: ReportSummary, meta: ExportMeta) {
  const { headline } = summary
  const labels = groupLabels(summary)
  return {
    title: meta.title || 'Focus group report',
    metaLine: `${reportMetaLine(summary.method)} · ${meta.exported ? 'Exported ' : ''}${longDate(meta.date)}`,
    verdict: {
      text: summary.verdict,
      confidence: `Confidence: ${CONFIDENCE_LABELS[summary.confidence.level]}`,
      reason: summary.confidence.reason,
      basis: basisNote(summary),
    },
    headline: [
      { label: 'Overall sentiment', value: formatSentiment(headline.sentiment), note: 'on a −5 to +5 scale' },
      shareTile('Would go ahead', headline.actShare, headline.actCount, headline.counted),
      shareTile('Would not go ahead', headline.switchShare, headline.switchCount, headline.counted),
      {
        label: 'Top concern',
        value: headline.topConcern ? capitalise(headline.topConcern.label) : '—',
        note: topConcernNote(summary),
      },
    ],
    split: {
      segments: splitSegments(summary.split),
      total: splitTotal(summary.split),
      label: splitLabel(summary.split),
    },
    groups: summary.groups.map((group) => ({
      id: group.id,
      cells: [
        group.label,
        String(group.people),
        formatSentiment(group.sentiment),
        group.actShare === null ? '—' : formatShare(group.actShare),
        group.summary,
      ],
    })),
    findings: summary.findings,
    risks: uniqueBy(summary.risks, (item) => item),
    opportunities: uniqueBy(summary.opportunities, (item) => item),
    participants: summary.participants.map((p) => ({
      id: p.agentId,
      name: p.name,
      details: participantDetails(p, labels.get(p.group)),
      stance: [participantSentiment(p), participantAction(p)].filter(Boolean).join(' · '),
      opinion: participantOpinion(p),
      quote: p.quote ?? null,
    })),
    sources: uniqueBy(summary.sources, (source) => source.url).map((source) => ({
      title: source.title || hostOf(source.url),
      url: source.url,
      host: hostOf(source.url),
      link: isWebUrl(source.url),
    })),
    sourcesEmpty: sourcesEmptyNote(summary.method),
    method: methodNote(summary.method),
    writeup: parseMarkdown(summary.writeup) satisfies Block[],
    writeupEmpty: summary.writeup.trim() ? null : WRITEUP_EMPTY,
  }
}

export type ReportDocument = ReturnType<typeof reportDocument>

export const NONE_RAISED = 'None raised.'
export const NO_GROUPS = 'No groups in this run.'
