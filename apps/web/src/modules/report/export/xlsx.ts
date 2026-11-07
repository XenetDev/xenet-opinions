import type { ReportSummary } from '@xo/engine/parts'
import ExcelJS from 'exceljs'
import { ACTION_LABELS, groupLabels } from '../format'
import { type ExportMeta, MIME_TYPES } from './meta'

const KIND_LABELS = { person: 'Person', organisation: 'Organisation' } as const

const nullable = <T>(value: T | null | undefined) => value ?? undefined

function addSheet(workbook: ExcelJS.Workbook, name: string, columns: Partial<ExcelJS.Column>[]) {
  const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] })
  sheet.columns = columns
  sheet.getRow(1).font = { bold: true }
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } }
  return sheet
}

const wrap = { alignment: { wrapText: true, vertical: 'top' } } as const

export async function exportXlsx(summary: ReportSummary, meta: ExportMeta): Promise<Blob> {
  const labels = groupLabels(summary)
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Xenet Opinions'
  workbook.title = meta.title
  workbook.created = meta.date

  const participants = addSheet(workbook, 'Participants', [
    { header: 'Name', key: 'name', width: 24 },
    { header: 'Group', key: 'group', width: 18 },
    { header: 'Kind', key: 'kind', width: 14 },
    { header: 'Age', key: 'age', width: 6 },
    { header: 'Role', key: 'role', width: 30, style: wrap },
    { header: 'Location', key: 'location', width: 16 },
    { header: 'Sentiment', key: 'sentiment', width: 10 },
    { header: 'Action', key: 'action', width: 20 },
    { header: 'Opinion', key: 'opinion', width: 60, style: wrap },
    { header: 'Quote', key: 'quote', width: 60, style: wrap },
  ])
  for (const p of summary.participants)
    participants.addRow({
      name: p.name,
      group: labels.get(p.group) ?? p.group,
      kind: KIND_LABELS[p.kind],
      age: p.age,
      role: p.role,
      location: p.location,
      sentiment: nullable(p.sentiment),
      action: ACTION_LABELS[p.action] ?? 'Not applicable',
      opinion: p.opinion,
      quote: p.quote,
    })

  const groups = addSheet(workbook, 'Groups', [
    { header: 'Group', key: 'group', width: 20 },
    { header: 'People', key: 'people', width: 8 },
    { header: 'Sentiment', key: 'sentiment', width: 10, style: { numFmt: '0.0' } },
    { header: 'Would go ahead', key: 'actShare', width: 15, style: { numFmt: '0%' } },
    { header: 'Would go ahead (people)', key: 'actCount', width: 22 },
    { header: 'People counted', key: 'counted', width: 15 },
    { header: 'What they say', key: 'summary', width: 70, style: wrap },
  ])
  for (const g of summary.groups)
    groups.addRow({
      group: g.label,
      people: g.people,
      sentiment: nullable(g.sentiment),
      actShare: nullable(g.actShare),
      actCount: g.counted ? g.actCount : undefined,
      counted: g.counted,
      summary: g.summary,
    })

  return new Blob([await workbook.xlsx.writeBuffer()], { type: MIME_TYPES.xlsx })
}
