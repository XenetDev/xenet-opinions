import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Message } from '@xo/db'
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
})
