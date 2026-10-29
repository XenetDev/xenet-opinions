import { describe, expect, it } from 'vitest'
import { chatTitleFrom } from './chat-title'

describe('chatTitleFrom', () => {
  it('keeps short text unchanged', () => {
    expect(chatTitleFrom('How should we price a car-free pass?')).toBe('How should we price a car-free pass?')
  })

  it('collapses whitespace and trims', () => {
    expect(chatTitleFrom('  a \n\n b\t c  ')).toBe('a b c')
  })

  it('cuts long text at a word boundary with an ellipsis', () => {
    const text = `${'word '.repeat(40)}tail`
    const title = chatTitleFrom(text)
    expect(title.endsWith('…')).toBe(true)
    expect(title.length).toBeLessThanOrEqual(121)
    expect(title.slice(0, -1)).toBe(title.slice(0, -1).trim())
    expect(
      title
        .slice(0, -1)
        .split(' ')
        .every((w) => w === 'word'),
    ).toBe(true)
  })

  it('trims trailing punctuation before the ellipsis', () => {
    const text = `${'a'.repeat(100)}, ${'b'.repeat(40)}`
    expect(chatTitleFrom(text)).toBe(`${'a'.repeat(100)}…`)
  })

  it('hard cuts when the only space is at the word floor', () => {
    const text = `${'a'.repeat(40)} ${'b'.repeat(120)}`
    expect(chatTitleFrom(text)).toBe(`${`${'a'.repeat(40)} ${'b'.repeat(79)}`}…`)
  })

  it('backs up when a space sits just past the word floor', () => {
    const text = `${'a'.repeat(41)} ${'b'.repeat(120)}`
    expect(chatTitleFrom(text)).toBe(`${'a'.repeat(41)}…`)
  })

  it('keeps a complete word when character 121 is a space', () => {
    const text = `${'a'.repeat(60)} ${'b'.repeat(59)} tail`
    expect(chatTitleFrom(text)).toBe(`${'a'.repeat(60)} ${'b'.repeat(59)}…`)
  })

  it('cuts a single long word hard at 120', () => {
    expect(chatTitleFrom('x'.repeat(150))).toBe(`${'x'.repeat(120)}…`)
  })

  it('returns an empty string for empty input', () => {
    expect(chatTitleFrom('')).toBe('')
    expect(chatTitleFrom('   ')).toBe('')
  })
})
