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

  it('keeps legacy interview parts without id and questionId', () => {
    const legacy = {
      type: 'data-interview',
      id: 'interview:a1',
      data: { agentId: 'a1', agentName: 'A', question: 'q', status: 'done', answer: 'yes' },
    }
    expect(toUIMessages([row([legacy])])[0]?.parts).toEqual([legacy])
  })

  it('whitelists data-interview_window parts and drops invalid ones', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const part = {
      type: 'data-interview_window',
      id: 'interview_window',
      data: { until: null, personaCount: 3, closed: true, reason: 'expired' },
    }
    const bad = { type: 'data-interview_window', data: { until: null, personaCount: 3, closed: true, reason: 'nope' } }
    expect(toUIMessages([row([part, bad])])[0]?.parts).toEqual([part])
  })

  it('accepts pausedAhead on data-queue parts', () => {
    const part = { type: 'data-queue', data: { position: 1, pausedAhead: true } }
    expect(toUIMessages([row([part])])[0]?.parts).toEqual([part])
  })

  it('whitelists data-queue parts', () => {
    const part = { type: 'data-queue', data: { position: 2 } }
    const rows = [{ id: 'a', role: 'assistant', parts: [part, { type: 'data-queue', data: { position: -1 } }] }]
    expect(toUIMessages(rows as never)[0]!.parts).toEqual([part])
  })

  it('drops transient cursor parts without logging', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const parts = [
      { type: 'data-cursor', id: 'cursor', data: { seq: 4 } },
      { type: 'text', text: 'hi' },
    ]
    expect(toUIMessages([row(parts)])[0]?.parts).toEqual([{ type: 'text', text: 'hi' }])
    expect(error).not.toHaveBeenCalled()
  })
})
