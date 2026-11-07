import { extractText } from 'unpdf'
import { describe, expect, it } from 'vitest'
import { reportQuestion, reportSummaryFixture as summary } from '../fixture'
import { SECTION_TITLES } from './content'
import { exportPdf } from './pdf'

const meta = { title: reportQuestion, date: new Date(2026, 10, 7) }

async function pdfText(blob: Blob) {
  const { text, totalPages } = await extractText(new Uint8Array(await blob.arrayBuffer()), { mergePages: true })
  return { text: text.replace(/\s+/g, ' '), totalPages }
}

describe('exportPdf', () => {
  it('returns a non-empty A4 PDF blob', async () => {
    const blob = await exportPdf(summary, meta)
    expect(blob.type).toBe('application/pdf')
    expect(blob.size).toBeGreaterThan(1000)
    const head = new TextDecoder().decode(new Uint8Array(await blob.arrayBuffer()).slice(0, 5))
    expect(head).toBe('%PDF-')
  })

  it('contains the verdict, every group label and the sections in the sheet order', async () => {
    const { text, totalPages } = await pdfText(await exportPdf(summary, meta))
    expect(text).toContain(summary.verdict)
    for (const group of summary.groups) expect(text).toContain(group.label)
    const positions = Object.values(SECTION_TITLES).map((title) => text.indexOf(title))
    expect(positions.every((p) => p >= 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
    expect(text.indexOf(reportQuestion)).toBeLessThan(Math.min(...positions))
    expect(text).toContain('7 November 2026')
    expect(text).toContain(`Page 1 of ${totalPages}`)
    expect(text).toContain('This is a simulation')
    expect(text).toContain('Klaus Müller')
    expect(text).toContain('Positive 3 (27%)')
    expect(text).toContain('3 of 9 people')
    for (const p of summary.participants) expect(text).toContain(p.name)
    for (const s of summary.sources) expect(text).toContain(s.title)
    expect(text).toContain("Owners read the rise as a break with Toyota's value promise.")
  })

  it('renders Latin-1 extras such as €, ß, curly quotes and the minus sign', async () => {
    const { text } = await pdfText(
      await exportPdf({ ...summary, verdict: 'Straße “Preis” €5 – ‘ok’ … −2' }, { ...meta, title: 'Größe' }),
    )
    expect(text).toContain('Straße “Preis” €5 – ‘ok’ … –2')
    expect(text).toContain('Größe')
    expect(text).toContain('–1.0')
  })
})
