import type { ReportSummary } from '@xo/engine/parts'
import writeXlsxFile, { type Cell, type Row } from 'write-excel-file/universal'
import { groupLabels, participantAction } from '../format'
import { type ExportMeta, MIME_TYPES } from './meta'

const KIND_LABELS = { person: 'Person', organisation: 'Organisation' } as const

type Column = { header: string; width: number; wrap?: boolean; format?: string }

const header = (columns: Column[]): Row => columns.map((c) => ({ value: c.header, fontWeight: 'bold' }))

const row = (columns: Column[], values: (string | number | null | undefined)[]): Row =>
  values.map((value, i): Cell => {
    const column = columns[i]
    if (value === null || value === undefined || value === '') return null
    return { value, wrap: column?.wrap, alignVertical: 'top', format: column?.format }
  })

const PARTICIPANT_COLUMNS: Column[] = [
  { header: 'Name', width: 24 },
  { header: 'Group', width: 18 },
  { header: 'Kind', width: 14 },
  { header: 'Age', width: 6 },
  { header: 'Role', width: 30, wrap: true },
  { header: 'Location', width: 16 },
  { header: 'Sentiment', width: 10 },
  { header: 'Action', width: 20 },
  { header: 'Opinion', width: 60, wrap: true },
  { header: 'Quote', width: 60, wrap: true },
]

const GROUP_COLUMNS: Column[] = [
  { header: 'Group', width: 20 },
  { header: 'People', width: 8 },
  { header: 'Sentiment', width: 10, format: '0.0' },
  { header: 'Would go ahead', width: 15, format: '0%' },
  { header: 'Would go ahead (people)', width: 22 },
  { header: 'People counted', width: 15 },
  { header: 'What they say', width: 70, wrap: true },
]

export async function exportXlsx(summary: ReportSummary, _meta: ExportMeta): Promise<Blob> {
  const labels = groupLabels(summary)
  const participants = summary.participants.map((p) =>
    row(PARTICIPANT_COLUMNS, [
      p.name,
      labels.get(p.group) ?? p.group,
      KIND_LABELS[p.kind],
      p.age,
      p.role,
      p.location,
      p.sentiment,
      p.kind === 'organisation' ? 'Not applicable' : participantAction(p),
      p.opinion,
      p.quote,
    ]),
  )
  const groups = summary.groups.map((g) =>
    row(GROUP_COLUMNS, [
      g.label,
      g.people,
      g.sentiment,
      g.actShare,
      g.counted ? g.actCount : undefined,
      g.counted,
      g.summary,
    ]),
  )
  const sheet = (name: string, columns: Column[], rows: Row[]) => ({
    sheet: name,
    data: [header(columns), ...rows],
    columns: columns.map((c) => ({ width: c.width })),
    stickyRowsCount: 1,
  })
  const blob = await writeXlsxFile([
    sheet('Participants', PARTICIPANT_COLUMNS, participants),
    sheet('Groups', GROUP_COLUMNS, groups),
  ]).toBlob()
  return new Blob([blob], { type: MIME_TYPES.xlsx })
}
