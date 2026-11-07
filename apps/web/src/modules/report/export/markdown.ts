export type Span = { text: string; bold?: boolean; italic?: boolean }

export type Block =
  | { type: 'heading'; level: 1 | 2 | 3; inline: Span[] }
  | { type: 'paragraph'; inline: Span[] }
  | { type: 'quote'; inline: Span[] }
  | { type: 'list'; ordered: boolean; items: Span[][] }

const INLINE = /(\*\*\*|___)(.+?)\1|(\*\*|__)(.+?)\3|(?<![\w*])([*_])(?!\s)(.+?)(?<!\s)\5(?![\w*])/g

const plain = (text: string) => text.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/`([^`]*)`/g, '$1')

export function parseInline(source: string): Span[] {
  const text = plain(source)
  const spans: Span[] = []
  const push = (span: Span) => {
    if (!span.text) return
    const last = spans.at(-1)
    if (last && !last.bold && !last.italic && !span.bold && !span.italic) last.text += span.text
    else spans.push(span)
  }
  let index = 0
  for (const match of text.matchAll(INLINE)) {
    push({ text: text.slice(index, match.index) })
    if (match[2] !== undefined) push({ text: match[2], bold: true, italic: true })
    else if (match[4] !== undefined) push({ text: match[4], bold: true })
    else push({ text: match[6] ?? '', italic: true })
    index = match.index + match[0].length
  }
  push({ text: text.slice(index) })
  return spans
}

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/
const BULLET = /^\s*[-*+]\s+(.*)$/
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/
const QUOTE = /^\s*>\s?(.*)$/
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/

const joinLines = (lines: string[]) => lines.map((line) => line.trim()).join(' ')

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = []
  let paragraph: string[] = []
  let quote: string[] = []
  let list: { ordered: boolean; items: string[] } | null = null

  const flush = () => {
    if (paragraph.length) blocks.push({ type: 'paragraph', inline: parseInline(joinLines(paragraph)) })
    if (quote.length) blocks.push({ type: 'quote', inline: parseInline(joinLines(quote)) })
    if (list) blocks.push({ type: 'list', ordered: list.ordered, items: list.items.map(parseInline) })
    paragraph = []
    quote = []
    list = null
  }

  for (const line of source.split(/\r?\n/)) {
    if (!line.trim() || RULE.test(line)) {
      flush()
      continue
    }
    const heading = HEADING.exec(line)
    if (heading) {
      flush()
      const level = Math.min(heading[1]?.length ?? 1, 3) as 1 | 2 | 3
      blocks.push({ type: 'heading', level, inline: parseInline(heading[2] ?? '') })
      continue
    }
    const quoted = QUOTE.exec(line)
    if (quoted) {
      if (!quote.length) flush()
      quote.push(quoted[1] ?? '')
      continue
    }
    const bullet = BULLET.exec(line)
    const numbered = bullet ? null : NUMBERED.exec(line)
    const item = bullet ?? numbered
    if (item) {
      const ordered = !!numbered
      if (!list || list.ordered !== ordered) {
        flush()
        list = { ordered, items: [] }
      }
      list.items.push(item[1] ?? '')
      continue
    }
    if (list && /^\s{2,}/.test(line)) {
      list.items[list.items.length - 1] += ` ${line.trim()}`
      continue
    }
    if (!paragraph.length) flush()
    paragraph.push(line)
  }
  flush()
  return blocks
}
