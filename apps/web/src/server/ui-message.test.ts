import type { Message } from '@xo/db'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { toUIMessages } from './ui-message'

afterEach(() => vi.restoreAllMocks())

const row = (parts: unknown[]) => ({ id: 'm1', role: 'assistant', parts }) as unknown as Message

describe('toUIMessages', () => {
  it('keeps valid parts and drops invalid, malformed and unknown ones', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const [message] = toUIMessages([
      row([
        { type: 'text', text: 'hi' },
        { type: 'text' },
        { type: 'data-stage', data: { stage: 'ontology', status: 'done' } },
        { type: 'data-stage', data: { stage: 'nope', status: 'done' } },
        { type: 'data-mystery', data: {} },
        'junk',
      ]),
    ])
    expect(message?.parts).toEqual([
      { type: 'text', text: 'hi' },
      { type: 'data-stage', data: { stage: 'ontology', status: 'done' } },
    ])
    expect(error).toHaveBeenCalledTimes(4)
  })

  it('whitelists data-interview parts and drops invalid ones', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const good = {
      type: 'data-interview',
      id: 'interview:a1',
      data: { id: 'i1', questionId: 'q1', agentId: 'a1', agentName: 'A', question: 'q', status: 'pending' },
    }
    const bad = { type: 'data-interview', data: { agentId: 'a1', status: 'nope' } }
    const [message] = toUIMessages([row([good, bad])])
    expect(message?.parts).toEqual([good])
  })

  it('whitelists data-queue parts', () => {
    const part = { type: 'data-queue', data: { position: 2 } }
    const rows = [{ id: 'a', role: 'assistant', parts: [part, { type: 'data-queue', data: { position: -1 } }] }]
    expect(toUIMessages(rows as never)[0]!.parts).toEqual([part])
  })
})
