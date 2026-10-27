import { describe, expect, it } from 'vitest'
import { EVENT_KINDS, partIdFor, payloadSchemaFor } from './events'

const interview = {
  id: 'iv_1',
  questionId: 'q_1',
  agentId: '0',
  agentName: 'Maya',
  question: 'Why?',
  status: 'pending' as const,
}

describe('events', () => {
  it('includes the interview window and interview kinds', () => {
    expect(EVENT_KINDS).toContain('interview_window')
    expect(EVENT_KINDS).toContain('interview')
  })

  it('builds part ids for interview events', () => {
    expect(partIdFor('interview_window', { until: null, personaCount: 1, closed: true })).toBe('interview_window')
    expect(partIdFor('interview', interview)).toBe('interview:iv_1')
  })

  it('validates interview payloads', () => {
    expect(payloadSchemaFor('interview').parse(interview)).toEqual(interview)
    expect(payloadSchemaFor('interview').safeParse({ ...interview, id: undefined }).success).toBe(false)
    expect(
      payloadSchemaFor('interview_window').parse({ until: null, personaCount: 1, closed: true, reason: 'expired' }),
    ).toEqual({ until: null, personaCount: 1, closed: true, reason: 'expired' })
  })

  it('accepts the interviews stage in stage payloads', () => {
    expect(payloadSchemaFor('stage').safeParse({ stage: 'interviews', status: 'running' }).success).toBe(true)
  })
})
