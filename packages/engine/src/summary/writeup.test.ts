import { describe, expect, it } from 'vitest'
import { cleanWriteup } from './writeup'

describe('cleanWriteup', () => {
  it('keeps at most the first blockquote in each section', () => {
    const markdown = [
      '# Report',
      '',
      '> Intro quote',
      '',
      '## Findings',
      '',
      'Owners are split.',
      '',
      '> "First quote"',
      '> continues here',
      '',
      'More text.',
      '',
      '> "Second quote"',
      '',
      '> "Third quote"',
      '',
      'Closing line.',
      '',
      '### Dealers',
      '',
      '> "Dealer quote"',
      '',
      '> "Another dealer quote"',
      '',
      'Done.',
    ].join('\n')
    expect(cleanWriteup(markdown)).toBe(
      [
        '# Report',
        '',
        '> Intro quote',
        '',
        '## Findings',
        '',
        'Owners are split.',
        '',
        '> "First quote"',
        '> continues here',
        '',
        'More text.',
        '',
        'Closing line.',
        '',
        '### Dealers',
        '',
        '> "Dealer quote"',
        '',
        'Done.',
      ].join('\n'),
    )
  })

  it('leaves markdown without blockquotes unchanged', () => {
    const markdown = '## A\n\nText\n\n## B\n\n- item'
    expect(cleanWriteup(markdown)).toBe(markdown)
  })
})
