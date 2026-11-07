// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reportQuestion, reportSummaryFixture as summary } from '../fixture'
import { downloadBlob, runExport } from './run'

const exporters = vi.hoisted(() => ({
  pdf: vi.fn(async () => new Blob(['pdf'], { type: 'application/pdf' })),
  docx: vi.fn(async () => new Blob(['docx'])),
  xlsx: vi.fn(async () => new Blob(['xlsx'])),
}))
vi.mock('./pdf', () => ({ exportPdf: exporters.pdf }))
vi.mock('./docx', () => ({ exportDocx: exporters.docx }))
vi.mock('./xlsx', () => ({ exportXlsx: exporters.xlsx }))

const meta = { title: reportQuestion, date: new Date(2026, 10, 7) }
const createObjectURL = vi.fn(() => 'blob:report')
const revokeObjectURL = vi.fn()
let clicked: { href: string; download: string; attached: boolean }[] = []

beforeEach(() => {
  vi.useFakeTimers()
  clicked = []
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }))
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push({ href: this.href, download: this.download, attached: document.body.contains(this) })
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  createObjectURL.mockClear()
  revokeObjectURL.mockClear()
})

describe('downloadBlob', () => {
  it('clicks a temporary anchor and revokes the object URL afterwards', () => {
    const blob = new Blob(['x'])
    downloadBlob(blob, 'a.pdf')
    expect(createObjectURL).toHaveBeenCalledWith(blob)
    expect(clicked).toEqual([{ href: 'blob:report', download: 'a.pdf', attached: true }])
    expect(document.querySelector('a')).toBeNull()
    expect(revokeObjectURL).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:report')
  })
})

describe('runExport', () => {
  it.each([
    ['pdf', exporters.pdf],
    ['docx', exporters.docx],
    ['xlsx', exporters.xlsx],
  ] as const)('loads the %s exporter on demand and downloads it under the report filename', async (kind, exporter) => {
    await runExport(kind, summary, meta)
    expect(exporter).toHaveBeenCalledWith(summary, meta)
    expect(clicked[0]?.download).toBe(
      `opinions-should-toyota-raise-the-corolla-hybrid-price-by-5-in-germany-2026-11-07.${kind}`,
    )
  })
})
