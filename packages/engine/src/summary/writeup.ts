const HEADING = /^#{2,3}\s/
const QUOTE = /^\s{0,3}>/

export function cleanWriteup(markdown: string): string {
  const out: string[] = []
  let quoteSeen = false
  let skipping = false
  for (const line of markdown.split('\n')) {
    if (HEADING.test(line)) {
      quoteSeen = false
      skipping = false
      out.push(line)
      continue
    }
    if (QUOTE.test(line)) {
      if (skipping) continue
      if (quoteSeen && out.length > 0 && !QUOTE.test(out.at(-1)!)) {
        skipping = true
        continue
      }
      quoteSeen = true
      out.push(line)
      continue
    }
    skipping = false
    if (line.trim() === '' && out.length > 0 && out.at(-1)!.trim() === '') continue
    out.push(line)
  }
  return out.join('\n')
}
