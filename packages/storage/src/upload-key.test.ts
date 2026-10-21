import { describe, expect, it } from 'vitest'
import { safeUploadName } from './upload-key'

describe('safeUploadName', () => {
  it('keeps a safe name with a matching extension', () => {
    expect(safeUploadName('brief.md', 'text/markdown')).toBe('brief.md')
    expect(safeUploadName('Deck.PDF', 'application/pdf')).toBe('Deck.PDF')
  })

  it('collapses dot-only and empty names to file', () => {
    expect(safeUploadName('..', 'text/plain')).toBe('file.txt')
    expect(safeUploadName('.', 'application/pdf')).toBe('file.pdf')
    expect(safeUploadName('', 'text/markdown')).toBe('file.md')
    expect(safeUploadName('.pdf', 'application/pdf')).toBe('file.pdf')
    expect(safeUploadName('...')).toBe('file')
  })

  it('appends the extension derived from the media type when missing', () => {
    expect(safeUploadName('notes', 'text/plain')).toBe('notes.txt')
    expect(safeUploadName('report.txt', 'application/pdf')).toBe('report.txt.pdf')
    expect(safeUploadName('notes')).toBe('notes')
  })

  it('replaces unsafe and unicode characters', () => {
    expect(safeUploadName('résumé 2026 (final).pdf', 'application/pdf')).toBe('r_sum__2026__final_.pdf')
    expect(safeUploadName('../../etc/passwd', 'text/plain')).toBe('.._.._etc_passwd.txt')
    expect(safeUploadName('报告.md', 'text/markdown')).toBe('__.md')
  })

  it('trims long names to 120 characters keeping the extension', () => {
    const long = safeUploadName(`${'a'.repeat(200)}.pdf`, 'application/pdf')
    expect(long).toHaveLength(120)
    expect(long.endsWith('.pdf')).toBe(true)
    const appended = safeUploadName('b'.repeat(200), 'text/markdown')
    expect(appended).toHaveLength(120)
    expect(appended.endsWith('.md')).toBe(true)
  })
})
