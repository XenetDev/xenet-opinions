const TITLE_MAX = 120
const WORD_FLOOR = 40

export function chatTitleFrom(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= TITLE_MAX) return clean
  const cut = clean.slice(0, TITLE_MAX)
  const space = clean.charAt(TITLE_MAX) === ' ' ? TITLE_MAX : cut.lastIndexOf(' ')
  const body = space > WORD_FLOOR ? cut.slice(0, space) : cut
  return `${body.replace(/[\s\p{P}]+$/u, '')}…`
}
