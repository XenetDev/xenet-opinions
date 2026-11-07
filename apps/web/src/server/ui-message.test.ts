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

  it('whitelists data-debrief parts and drops invalid ones', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const part = {
      type: 'data-debrief',
      id: 'debrief',
      data: { answers: [{ agentId: '0', name: 'Maya', answer: 'Yes', status: 'done' }] },
    }
    const bad = { type: 'data-debrief', data: { answers: [{ agentId: '0', name: 'Maya', status: 'pending' }] } }
    expect(toUIMessages([row([part, bad])])[0]?.parts).toEqual([part])
  })

  it('whitelists data-report_summary and data-report_summary_failed parts and drops invalid ones', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const summary = {
      verdict: 'V',
      confidence: { level: 'low', reason: 'R' },
      headline: { sentiment: 1.5, actShare: 0.5, switchShare: 0.25, topConcern: { label: 'price', count: 2 } },
      split: { positive: 2, neutral: 1, negative: 1 },
      groups: [{ id: 'customers', label: 'Customers', people: 4, sentiment: 1.5, actShare: 0.5, summary: 'S' }],
      findings: [{ title: 'T', detail: 'D', quote: { text: 'Q', name: 'Maya' } }],
      risks: ['R'],
      opportunities: ['O'],
      participants: [
        {
          agentId: '0',
          name: 'Maya',
          group: 'customers',
          kind: 'person',
          sentiment: 3,
          action: 'act',
          opinion: 'Yes',
          quote: 'Q',
        },
      ],
      sources: [{ title: 'A', url: 'https://a.test' }],
      method: { participants: 4, groups: 1, rounds: 3, webResearch: true },
      writeup: '## W',
    }
    const part = { type: 'data-report_summary', id: 'report_summary', data: summary }
    const failed = { type: 'data-report_summary_failed', id: 'report_summary_failed', data: { message: 'boom' } }
    const bad = { type: 'data-report_summary', data: { ...summary, headline: { ...summary.headline, sentiment: 9 } } }
    const badFailed = { type: 'data-report_summary_failed', data: {} }
    expect(toUIMessages([row([part, failed, bad, badFailed])])[0]?.parts).toEqual([part, failed])
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
