import { describe, expect, it, vi } from 'vitest'
import { documentText } from './document-text'

function pdf(text: string): Uint8Array {
  const stream = `BT /F1 24 Tf 72 720 Td (${text}) Tj ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let body = '%PDF-1.4\n'
  const offsets = objects.map((object, i) => {
    const offset = body.length
    body += `${i + 1} 0 obj\n${object}\nendobj\n`
    return offset
  })
  const xref = body.length
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) body += `${String(offset).padStart(10, '0')} 00000 n \n`
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(body)
}

const text = (value: string) => new TextEncoder().encode(value)

describe('documentText', () => {
  it('extracts text from a PDF', async () => {
    const result = await documentText({
      bytes: pdf('Angel investors'),
      mediaType: 'application/pdf',
      filename: 'deck.pdf',
    })
    expect(result).toContain('Angel investors')
  })

  it('reads markdown and plain text', async () => {
    expect(
      await documentText({ bytes: text('# Plan\n\nShip it.\n'), mediaType: 'text/markdown', filename: 'a.md' }),
    ).toBe('# Plan\n\nShip it.')
    expect(await documentText({ bytes: text('  notes  '), mediaType: 'text/plain', filename: 'a.txt' })).toBe('notes')
  })

  it('returns an empty string when extraction fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(
      await documentText({ bytes: new Uint8Array([0x00]), mediaType: 'application/pdf', filename: 'bad.pdf' }),
    ).toBe('')
  })

  it('cuts long text to 12 000 characters', async () => {
    const result = await documentText({
      bytes: text('a'.repeat(20_000)),
      mediaType: 'text/plain',
      filename: 'long.txt',
    })
    expect(result).toHaveLength(12_000)
  })
})
