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
      { type: 'list', ordered: false, start: 1, items: [[{ text: 'one' }], [{ text: 'two' }]] },
      { type: 'list', ordered: true, start: 1, items: [[{ text: 'first' }], [{ text: 'second' }]] },
      { type: 'quote', inline: [{ text: 'Five percent more and Hyundai wins.' }] },
      { type: 'heading', level: 3, inline: [{ text: 'Deep' }] },
    ])
  })

  it('keeps the start number of an ordered list', () => {
    expect(parseMarkdown('3. third\n4. fourth')).toEqual([
      { type: 'list', ordered: true, start: 3, items: [[{ text: 'third' }], [{ text: 'fourth' }]] },
    ])
  })

  it('reads GFM tables as header and rows', () => {
    expect(
      parseMarkdown('Intro\n\n| Group | Share |\n|:---|---:|\n| **Owners** | 25% |\n| Dealers | 0% |\n\nAfter'),
    ).toEqual([
      { type: 'paragraph', inline: [{ text: 'Intro' }] },
      {
        type: 'table',
        header: [[{ text: 'Group' }], [{ text: 'Share' }]],
        rows: [
          [[{ text: 'Owners', bold: true }], [{ text: '25%' }]],
          [[{ text: 'Dealers' }], [{ text: '0%' }]],
        ],
      },
      { type: 'paragraph', inline: [{ text: 'After' }] },
    ])
  })

  it('keeps fenced code literal and drops the fence lines', () => {
    expect(parseMarkdown('```js\n# not a heading\n- not a list\n```\nText')).toEqual([
      { type: 'code', lines: ['# not a heading', '- not a list'] },
      { type: 'paragraph', inline: [{ text: 'Text' }] },
    ])
  })

  it('keeps link text when the URL has parentheses', () => {
    expect(parseInline('See [a](https://x.test/(b)) now')).toEqual([{ text: 'See a now' }])
  })

  it('returns nothing for empty input', () => {
    expect(parseMarkdown('  \n\n')).toEqual([])
  })
})
