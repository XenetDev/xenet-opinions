import { join } from 'node:path'
import { extractText, getDocumentProxy } from 'unpdf'
import { describe, expect, it } from 'vitest'
import { reportQuestion, reportSummaryFixture as summary } from '../fixture'
import { SECTION_TITLES } from './content'
import { exportPdf as render } from './pdf'

const meta = { title: reportQuestion, date: new Date(2026, 10, 7) }
const fontBase = `${join(process.cwd(), 'public/fonts')}/`
const exportPdf: typeof render = (summary, meta) => render(summary, meta, { fontBase })

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

  it('renders accents, €, curly quotes and the true minus with the embedded font', async () => {
    const { text } = await pdfText(
      await exportPdf({ ...summary, verdict: 'Straße “Preis” €5 – ‘ok’ … −2' }, { ...meta, title: 'Größe' }),
    )
    expect(text).toContain('Straße “Preis” €5 – ‘ok’ … −2')
    expect(text).toContain('Größe')
    expect(text).toContain('−1.0')
  })

  it('keeps Cyrillic and Greek, spells out arrows and drops emoji', async () => {
    const participants = summary.participants.map((p, i) => (i === 0 ? { ...p, name: 'Дмитрий Иванов' } : p))
    const { text } = await pdfText(
      await exportPdf({ ...summary, participants, writeup: 'Price → churn ≥ 5% ✓ for Ωmega owners 😀.' }, meta),
    )
    expect(text).toContain('Дмитрий Иванов')
    expect(text).toContain('Price -> churn >= 5% (yes) for Ωmega owners .')
  })

  it('switches to the CJK font only when the report has CJK text', async () => {
    const plain = await exportPdf(summary, meta)
    const cjk = await exportPdf({ ...summary, verdict: '田中さんは値上げに反対です。' }, meta)
    expect((await pdfText(cjk)).text).toContain('田中さんは値上げに反対です。')
    const fonts = async (blob: Blob) => new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()))
    expect(await fonts(plain)).not.toMatch(/NotoSansSC|NotoSansCJK/)
    expect(await fonts(cjk)).toMatch(/NotoSansSC|NotoSansCJK/)
    expect(cjk.size).toBeGreaterThan(plain.size)
  }, 30_000)

  it('wraps a very long unbroken token inside the page and prints source hosts', async () => {
    const token = `https://exa.ai/search?q=${'corolla-hybrid-price-'.repeat(6)}&ref=${'x'.repeat(20)}`
    expect(token.length).toBeGreaterThan(150)
    const blob = await exportPdf({ ...summary, writeup: `Long token: ${token}` }, meta)
    const pdf = await getDocumentProxy(new Uint8Array(await blob.arrayBuffer()))
    let right = 0
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n)
      const { items } = await page.getTextContent()
      for (const item of items) if ('transform' in item) right = Math.max(right, item.transform[4] + item.width)
    }
    expect(right).toBeLessThan(595.28 - 40)
    const { text } = await pdfText(blob)
    expect(text.replace(/[\s-]/g, '')).toContain(token.replace(/-/g, ''))
    expect(text).toContain('adac.de')
    expect(text).not.toContain('https://www.adac.de/rund-ums-fahrzeug/autokatalog/')
  })

  it('says when the date is the export date and notes an empty write-up', async () => {
    const { text } = await pdfText(await exportPdf({ ...summary, writeup: ' ' }, { ...meta, exported: true }))
    expect(text).toContain('Exported 7 November 2026')
    expect(text).toContain('No written analysis for this run.')
  })
})
