import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { reportQuestion, reportSummaryFixture as summary } from '../fixture'
import { exportXlsx } from './xlsx'

const meta = { title: reportQuestion, date: new Date(2026, 10, 7) }

async function load(blob: Blob) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await blob.arrayBuffer())
  return workbook
}

const rowValues = (sheet: ExcelJS.Worksheet, n: number) => (sheet.getRow(n).values as unknown[]).slice(1)

describe('exportXlsx', () => {
  it('returns a non-empty Excel blob', async () => {
    const blob = await exportXlsx(summary, meta)
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    expect(blob.size).toBeGreaterThan(1000)
  })

  it('has a Participants sheet with one row per participant', async () => {
    const workbook = await load(await exportXlsx(summary, meta))
    expect(workbook.worksheets.map((s) => s.name)).toEqual(['Participants', 'Groups'])
    const sheet = workbook.getWorksheet('Participants')
    if (!sheet) throw new Error('missing sheet')
    expect(rowValues(sheet, 1)).toEqual([
      'Name',
      'Group',
      'Kind',
      'Age',
      'Role',
      'Location',
      'Sentiment',
      'Action',
      'Opinion',
      'Quote',
    ])
    expect(sheet.actualRowCount).toBe(summary.participants.length + 1)
    expect(rowValues(sheet, 2)).toEqual([
      'Klaus Müller',
      'Customers',
      'Person',
      52,
      'Corolla Hybrid owner since 2019',
      'Munich',
      -3,
      'Would not go ahead',
      'Bought Toyota as the sensible choice and sees the rise as breaking that promise.',
      'Five percent more and Hyundai is the sensible choice.',
    ])
    const org = rowValues(sheet, 11)
    expect(org.slice(0, 4)).toEqual(['Autohaus Weber GmbH', 'Dealers/partners', 'Organisation', undefined])
    expect(org[7]).toBe('Not applicable')
    const noView = rowValues(sheet, 13)
    expect(noView[0]).toBe('Felix Braun')
    expect(noView[6]).toBeUndefined()
    expect(noView[7]).toBeUndefined()
    expect(noView[8]).toBe('No view expressed')
  })

  it('has a Groups sheet with one row per group and shares as numbers', async () => {
    const sheet = (await load(await exportXlsx(summary, meta))).getWorksheet('Groups')
    if (!sheet) throw new Error('missing sheet')
    expect(rowValues(sheet, 1)).toEqual([
      'Group',
      'People',
      'Sentiment',
      'Would go ahead',
      'Would go ahead (people)',
      'People counted',
      'What they say',
    ])
    expect(sheet.actualRowCount).toBe(summary.groups.length + 1)
    expect(rowValues(sheet, 3)).toEqual([
      'Prospects',
      3,
      1,
      0.67,
      2,
      3,
      'Would accept it with a longer hybrid warranty.',
    ])
    expect(sheet.getCell('D3').numFmt).toBe('0%')
    expect(rowValues(sheet, 5).slice(0, 4)).toEqual(['Media', 2, -2, undefined])
  })
})
