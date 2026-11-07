import { describe, expect, it } from 'vitest'
import { reportQuestion } from '../fixture'
import { exportFilename, slugify } from './meta'

const date = new Date(2026, 10, 7, 23, 30)

describe('slugify', () => {
  it('lowercases ASCII words joined by hyphens', () => {
    expect(slugify(reportQuestion)).toBe('should-toyota-raise-the-corolla-hybrid-price-by-5-in-germany')
  })

  it('folds accents and trims punctuation', () => {
    expect(slugify('  Über  Preise für Mütter? ')).toBe('uber-preise-fur-mutter')
    expect(slugify('Straße & “Kaffee” — €5')).toBe('strasse-kaffee-5')
  })

  it('caps the slug at about 60 characters without a trailing hyphen', () => {
    const slug = slugify('word '.repeat(40))
    expect(slug.length).toBeLessThanOrEqual(60)
    expect(slug).not.toMatch(/-$/)
  })

  it('falls back to "report" for titles with no Latin characters', () => {
    expect(slugify('トヨタは値上げすべきか')).toBe('report')
    expect(slugify('')).toBe('report')
  })
})

describe('exportFilename', () => {
  it('builds opinions-<slug>-<yyyy-mm-dd>.<ext> from the local date', () => {
    expect(exportFilename('pdf', { title: reportQuestion, date })).toBe(
      'opinions-should-toyota-raise-the-corolla-hybrid-price-by-5-in-germany-2026-11-07.pdf',
    )
    expect(exportFilename('docx', { title: 'Raise salaries?', date })).toBe('opinions-raise-salaries-2026-11-07.docx')
    expect(exportFilename('xlsx', { title: '値上げ', date: new Date(2026, 0, 3) })).toBe(
      'opinions-report-2026-01-03.xlsx',
    )
    expect(exportFilename('pdf', { title: '', date })).toBe('opinions-report-2026-11-07.pdf')
  })
})
