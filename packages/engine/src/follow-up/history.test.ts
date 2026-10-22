import type { Message } from '@xo/db'
import { describe, expect, it } from 'vitest'
import { buildChatHistory } from './history'

const msg = (id: string, role: string, parts: unknown[]): Message => ({ id, chatId: 'c', role, parts, createdAt: new Date(0) })
const text = (t: string) => ({ type: 'text', text: t })

describe('buildChatHistory', () => {
  it('returns rows strictly after the anchor', () => {
    const rows = [msg('a', 'user', [text('old')]), msg('b', 'assistant', [text('report')]), msg('c', 'user', [text('q1')]), msg('d', 'assistant', [text('a1')])]
    expect(buildChatHistory(rows, { afterMessageId: 'b' })).toEqual([
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1' },
    ])
  })

  it('excludes the given message', () => {
    const rows = [msg('b', 'assistant', [text('report')]), msg('c', 'user', [text('q1')]), msg('d', 'assistant', [text('a1')]), msg('e', 'user', [text('q2')])]
    expect(buildChatHistory(rows, { afterMessageId: 'b', excludeMessageId: 'e' }).map((m) => m.content)).toEqual(['q1', 'a1'])
  })

  it('skips rows without text parts and joins multiple text parts', () => {
    const rows = [
      msg('b', 'assistant', [text('report')]),
      msg('c', 'user', [text('who?')]),
      msg('d', 'assistant', [{ type: 'data-interview', id: 'interview:1', data: {} }]),
      msg('e', 'assistant', [text('one'), { type: 'data-interview', data: {} }, text('two')]),
    ]
    expect(buildChatHistory(rows, { afterMessageId: 'b' })).toEqual([
      { role: 'user', content: 'who?' },
      { role: 'assistant', content: 'onetwo' },
    ])
  })

  it('keeps only the last 10 pairs by default', () => {
    const rows = [msg('anchor', 'assistant', [text('r')])]
    for (let i = 0; i < 12; i++) {
      rows.push(msg(`u${i}`, 'user', [text(`q${i}`)]), msg(`a${i}`, 'assistant', [text(`a${i}`)]))
    }
    const out = buildChatHistory(rows, { afterMessageId: 'anchor' })
    expect(out).toHaveLength(20)
    expect(out[0]).toEqual({ role: 'user', content: 'q2' })
    expect(out.at(-1)).toEqual({ role: 'assistant', content: 'a11' })
    expect(buildChatHistory(rows, { afterMessageId: 'anchor', maxTurns: 1 })).toHaveLength(2)
  })
})
