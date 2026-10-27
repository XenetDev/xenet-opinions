import { readFileSync } from 'node:fs'
import type { InterviewBatchResult } from '@xo/mirofish'
import { describe, expect, it } from 'vitest'
import { interviewsToParts, mirofishAgentId, pendingInterviewParts } from './interviews'

const requested = [
  { id: 'i1', questionId: 'q', agentId: '3', agentName: 'Ada', question: 'Why?' },
  { id: 'i2', questionId: 'q', agentId: 'abc', agentName: 'Bo', question: 'How?' },
  { id: 'i3', questionId: 'q', agentId: '7', agentName: 'Cy', question: 'When?' },
]

describe('mirofishAgentId', () => {
  it('sends digit strings as numbers and others as strings', () => {
    expect(mirofishAgentId('3')).toBe(3)
    expect(mirofishAgentId('abc')).toBe('abc')
    expect(mirofishAgentId('3a')).toBe('3a')
  })
})

describe('interviewsToParts', () => {
  it('matches numeric ids, fails missing, ignores extras, keeps requested order', () => {
    const parts = interviewsToParts(
      {
        result: {
          results: {
            twitter_99: { agent_id: 99, platform: 'twitter', response: 'extra' },
            twitter_abc: { agent_id: 'abc', platform: 'twitter', response: 'Hello' },
            twitter_3: { agent_id: 3, platform: 'twitter', response: 'Because' },
            reddit_3: { agent_id: 3, platform: 'reddit', response: 'Reddit answer' },
          },
        },
      },
      requested,
    )
    expect(parts).toEqual([
      { ...requested[0], status: 'done', answer: 'Because' },
      { ...requested[1], status: 'done', answer: 'Hello' },
      { ...requested[2], status: 'failed', error: 'No answer' },
    ])
  })

  it('marks errored results as failed', () => {
    const parts = interviewsToParts({ result: { results: { twitter_3: { agent_id: 3, error: 'boom' } } } }, [
      requested[0]!,
    ])
    expect(parts).toEqual([{ ...requested[0], status: 'failed', error: 'No answer' }])
  })

  it('maps the batch response captured from a real MiroFish run', () => {
    const fixture = JSON.parse(
      readFileSync(new URL('../../../mirofish/src/fixtures/simulation.interview-batch.json', import.meta.url), 'utf8'),
    ) as { data: InterviewBatchResult }
    const parts = interviewsToParts(fixture.data, [
      { id: 'i0', questionId: 'q', agentId: '0', agentName: 'A', question: 'q' },
      { id: 'i5', questionId: 'q', agentId: '5', agentName: 'B', question: 'q' },
    ])
    expect(parts.map((p) => p.status)).toEqual(['done', 'done'])
    expect(parts.every((p) => (p.answer ?? '').length > 0)).toBe(true)
  })

  it('fails everything when results are absent', () => {
    expect(interviewsToParts({}, [requested[0]!])[0]).toMatchObject({ status: 'failed', error: 'No answer' })
  })
})

describe('pendingInterviewParts', () => {
  it('returns pending parts in requested order', () => {
    expect(pendingInterviewParts(requested).map((p) => [p.agentId, p.status])).toEqual([
      ['3', 'pending'],
      ['abc', 'pending'],
      ['7', 'pending'],
    ])
  })
})
