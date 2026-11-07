import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { reportQuestion, reportSummaryFixture as summary } from '../fixture'
import { SECTION_TITLES } from './content'
import { exportDocx } from './docx'

const meta = { title: reportQuestion, date: new Date(2026, 10, 7) }

async function docxXml(blob: Blob, path = 'word/document.xml') {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  return (await zip.file(path)?.async('string')) ?? ''
}

const textOf = (xml: string) =>
  [...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:p[ >]/g)]
    .map((m) => (m[1] === undefined ? ' ' : m[1]))
    .join('')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')

describe('exportDocx', () => {
  it('returns a non-empty Word blob', async () => {
    const blob = await exportDocx(summary, meta)
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    expect(blob.size).toBeGreaterThan(1000)
  })

  it('holds every section in the sheet order with the verdict, groups, participants and write-up', async () => {
    const text = textOf(await docxXml(await exportDocx(summary, meta)))
    expect(text).toContain(summary.verdict)
    for (const group of summary.groups) expect(text).toContain(group.label)
    const positions = Object.values(SECTION_TITLES).map((title) => text.indexOf(title))
    expect(positions.every((p) => p >= 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
    expect(text.indexOf(reportQuestion)).toBeLessThan(Math.min(...positions))
    expect(text).toContain('7 November 2026')
    expect(text).toContain('This is a simulation')
    expect(text).toContain('Positive 3 (27%)')
    expect(text).toContain('3 of 9 people')
    expect(text).toContain('Five percent more and Hyundai is the sensible choice.')
    for (const p of summary.participants) expect(text).toContain(p.name)
    for (const s of summary.sources) expect(text).toContain(s.title)
    expect(text).toContain("Owners read the rise as a break with Toyota's value promise.")
  })

  it('prints source hosts, the export label, list starts, tables and code', async () => {
    const writeup = '3. third\n4. fourth\n\n| Group | Share |\n|---|---|\n| Owners | 25% |\n\n```\n# literal\n```'
    const text = textOf(await docxXml(await exportDocx({ ...summary, writeup }, { ...meta, exported: true })))
    expect(text).toContain('adac.de')
    expect(text).not.toContain('https://www.adac.de/rund-ums-fahrzeug/autokatalog/')
    expect(text).toContain('Exported 7 November 2026')
    expect(text).toContain('3. third')
    expect(text).toContain('4. fourth')
    expect(text).toMatch(/Group Share.*Owners 25%/)
    expect(text).toContain('# literal')
  })

  it('notes an empty write-up like the sheet', async () => {
    const text = textOf(await docxXml(await exportDocx({ ...summary, writeup: '' }, meta)))
    expect(text).toContain('No written analysis for this run.')
  })

  it('numbers its pages in the footer', async () => {
    const zip = await JSZip.loadAsync(await (await exportDocx(summary, meta)).arrayBuffer())
    const footers = await Promise.all(
      Object.keys(zip.files)
        .filter((name) => /^word\/footer\d*\.xml$/.test(name))
        .map((name) => zip.file(name)?.async('string') ?? ''),
    )
    expect(footers.join('')).toMatch(/PAGE/)
  })
})
