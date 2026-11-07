import { describe, expect, it } from 'vitest'
import { parseInline, parseMarkdown } from './markdown'

describe('parseInline', () => {
  it('splits bold and italic runs', () => {
    expect(parseInline('Plain **bold** and *italic* and __b__ _i_ ***both***')).toEqual([
      { text: 'Plain ' },
      { text: 'bold', bold: true },
      { text: ' and ' },
      { text: 'italic', italic: true },
      { text: ' and ' },
      { text: 'b', bold: true },
      { text: ' ' },
      { text: 'i', italic: true },
      { text: ' ' },
      { text: 'both', bold: true, italic: true },
    ])
  })

  it('keeps link text, drops inline code ticks and leaves stray markers alone', () => {
    expect(parseInline('See [ADAC](https://adac.de) and `code`, 5 * 3')).toEqual([{ text: 'See ADAC and code, 5 * 3' }])
  })
})

describe('parseMarkdown', () => {
  it('reads headings, paragraphs, lists and blockquotes', () => {
    const blocks = parseMarkdown(
      [
        '## Overview',
        '',
        'Owners read the rise',
        'as a break.',
        '',
        '- one',
        '* two',
        '',
        '1. first',
        '2) second',
        '',
        '> Five percent more',
        '> and Hyundai wins.',
        '',
        '---',
        '#### Deep',
      ].join('\n'),
    )
    expect(blocks).toEqual([
      { type: 'heading', level: 2, inline: [{ text: 'Overview' }] },
      { type: 'paragraph', inline: [{ text: 'Owners read the rise as a break.' }] },
      { type: 'list', ordered: false, items: [[{ text: 'one' }], [{ text: 'two' }]] },
      { type: 'list', ordered: true, items: [[{ text: 'first' }], [{ text: 'second' }]] },
      { type: 'quote', inline: [{ text: 'Five percent more and Hyundai wins.' }] },
      { type: 'heading', level: 3, inline: [{ text: 'Deep' }] },
    ])
  })

  it('returns nothing for empty input', () => {
    expect(parseMarkdown('  \n\n')).toEqual([])
  })
})
