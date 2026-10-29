import { describe, expect, it } from 'vitest'
import { validateUploads } from './upload-rules'

const file = (name: string, type: string, size = 10) => ({ name, type, size })

describe('validateUploads', () => {
  it('rejects more than 5 files', () => {
    const files = Array.from({ length: 6 }, (_, i) => file(`a${i}.txt`, 'text/plain'))
    expect(validateUploads(files)).toEqual({ ok: false, reason: 'too_many' })
  })

  it('accepts exactly 5 files', () => {
    const files = Array.from({ length: 5 }, (_, i) => file(`a${i}.txt`, 'text/plain'))
    expect(validateUploads(files)).toMatchObject({ ok: true })
  })

  it('rejects files over 50 MB', () => {
    expect(validateUploads([file('a.pdf', 'application/pdf', 51 * 1024 * 1024)])).toEqual({
      ok: false,
      reason: 'too_large',
    })
  })

  it('accepts a file between the old 10 MB and the 48 MB total cap', () => {
    expect(validateUploads([file('a.pdf', 'application/pdf', 40 * 1024 * 1024)])).toMatchObject({ ok: true })
  })

  it('rejects files totalling more than 48 MB', () => {
    const mb = 1024 * 1024
    expect(
      validateUploads([file('a.pdf', 'application/pdf', 30 * mb), file('b.pdf', 'application/pdf', 30 * mb)]),
    ).toEqual({ ok: false, reason: 'too_large' })
    expect(
      validateUploads([file('a.pdf', 'application/pdf', 24 * mb), file('b.pdf', 'application/pdf', 24 * mb)]),
    ).toMatchObject({ ok: true })
  })

  it('rejects unsupported types', () => {
    expect(validateUploads([file('a.exe', 'application/x-msdownload')])).toEqual({ ok: false, reason: 'bad_type' })
  })

  it('infers markdown from extension when type is empty', () => {
    expect(validateUploads([file('notes.md', '')])).toEqual({
      ok: true,
      files: [{ name: 'notes.md', mediaType: 'text/markdown', size: 10 }],
    })
  })

  it('infers pdf from octet-stream', () => {
    expect(validateUploads([file('a.PDF', 'application/octet-stream')])).toEqual({
      ok: true,
      files: [{ name: 'a.PDF', mediaType: 'application/pdf', size: 10 }],
    })
  })

  it('rejects an empty type with an unknown extension', () => {
    expect(validateUploads([file('a.exe', '')])).toEqual({ ok: false, reason: 'bad_type' })
  })
})
