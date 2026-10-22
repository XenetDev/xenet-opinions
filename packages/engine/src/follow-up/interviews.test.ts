import { describe, expect, it } from 'vitest'
import { interviewsToParts, mirofishAgentId, pendingInterviewParts } from './interviews'

const requested = [
  { agentId: '3', agentName: 'Ada', question: 'Why?' },
  { agentId: 'abc', agentName: 'Bo', question: 'How?' },
  { agentId: '7', agentName: 'Cy', question: 'When?' },
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
      { results: [{ agent_id: 99, response: 'extra' }, { agent_id: 'abc', response: 'Hello' }, { agent_id: 3, response: 'Because' }] },
      requested,
    )
    expect(parts).toEqual([
      { agentId: '3', agentName: 'Ada', question: 'Why?', status: 'done', answer: 'Because' },
      { agentId: 'abc', agentName: 'Bo', question: 'How?', status: 'done', answer: 'Hello' },
      { agentId: '7', agentName: 'Cy', question: 'When?', status: 'failed', error: 'No answer' },
    ])
  })

  it('marks errored results as failed', () => {
    const parts = interviewsToParts({ results: [{ agent_id: 3, error: 'boom' }] }, [requested[0]!])
    expect(parts).toEqual([{ agentId: '3', agentName: 'Ada', question: 'Why?', status: 'failed', error: 'No answer' }])
  })

  it('fails everything when results are absent', () => {
    expect(interviewsToParts({}, [requested[0]!])[0]).toMatchObject({ status: 'failed', error: 'No answer' })
  })
})

describe('pendingInterviewParts', () => {
  it('returns pending parts in requested order', () => {
    expect(pendingInterviewParts(requested).map((p) => [p.agentId, p.status])).toEqual([['3', 'pending'], ['abc', 'pending'], ['7', 'pending']])
  })
})
