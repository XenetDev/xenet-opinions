import { describe, expect, it } from 'vitest'
import { parseMessageBody } from './message-body'

const base = { id: 'c1', message: { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hi' }] } }

describe('parseMessageBody follow-up fields', () => {
  it('defaults target to report and agentIds to empty', () => {
    const body = parseMessageBody(base)
    expect(body?.target).toBe('report')
    expect(body?.agentIds).toEqual([])
  })

  it('defaults pauseForInterviews to false and accepts true', () => {
    expect(parseMessageBody(base)?.runOptions).toEqual({ maxRounds: 3, pauseForInterviews: false })
    expect(parseMessageBody({ ...base, runOptions: { pauseForInterviews: true } })?.runOptions).toEqual({
      maxRounds: 3,
      pauseForInterviews: true,
    })
    expect(parseMessageBody({ ...base, runOptions: { pauseForInterviews: 'yes' } })).toBeNull()
  })

  it('accepts agents target with up to 5 ids', () => {
    const body = parseMessageBody({ ...base, target: 'agents', agentIds: ['a', 'b', 'c', 'd', 'e'] })
    expect(body?.target).toBe('agents')
    expect(body?.agentIds).toHaveLength(5)
  })

  it('rejects an unknown target, more than 5 ids, and empty or oversized ids', () => {
    expect(parseMessageBody({ ...base, target: 'nope' })).toBeNull()
    expect(parseMessageBody({ ...base, agentIds: ['a', 'b', 'c', 'd', 'e', 'f'] })).toBeNull()
    expect(parseMessageBody({ ...base, agentIds: [''] })).toBeNull()
    expect(parseMessageBody({ ...base, agentIds: ['x'.repeat(65)] })).toBeNull()
  })
})

describe('parseMessageBody run fields', () => {
  it('accepts empty uploadIds and no seed', () => {
    const body = parseMessageBody({ ...base, uploadIds: [] })
    expect(body?.uploadIds).toEqual([])
    expect(body?.seed).toBeUndefined()
  })

  it('trims seed fields and leaves missing ones undefined', () => {
    expect(parseMessageBody({ ...base, seed: { background: '  Small SaaS  ', change: '\n' } })?.seed).toEqual({
      background: 'Small SaaS',
      change: '',
    })
  })

  it('rejects a seed field over 2000 characters', () => {
    expect(parseMessageBody({ ...base, seed: { actors: 'x'.repeat(2000) } })?.seed?.actors).toHaveLength(2000)
    expect(parseMessageBody({ ...base, seed: { actors: 'x'.repeat(2001) } })).toBeNull()
    expect(parseMessageBody({ ...base, seed: { background: 1 } })).toBeNull()
  })
})

describe('parseMessageBody panel', () => {
  const panel = {
    participants: 25,
    audience: 'Small business owners',
    groups: ['customers', 'skeptics'],
    webResearch: true,
  }

  it('accepts a valid panel and researchId', () => {
    const body = parseMessageBody({ ...base, panel, researchId: 'r1' })
    expect(body?.panel).toEqual(panel)
    expect(body?.researchId).toBe('r1')
  })

  it('leaves panel and researchId undefined when absent', () => {
    const body = parseMessageBody(base)
    expect(body?.panel).toBeUndefined()
    expect(body?.researchId).toBeUndefined()
  })

  it('rejects participants outside 4 to 50', () => {
    expect(parseMessageBody({ ...base, panel: { ...panel, participants: 3 } })).toBeNull()
    expect(parseMessageBody({ ...base, panel: { ...panel, participants: 51 } })).toBeNull()
    expect(parseMessageBody({ ...base, panel: { ...panel, participants: 4 } })).not.toBeNull()
    expect(parseMessageBody({ ...base, panel: { ...panel, participants: 50 } })).not.toBeNull()
  })

  it('rejects unknown groups and audiences over 300 characters', () => {
    expect(parseMessageBody({ ...base, panel: { ...panel, groups: ['aliens'] } })).toBeNull()
    expect(parseMessageBody({ ...base, panel: { ...panel, audience: 'x'.repeat(301) } })).toBeNull()
    expect(parseMessageBody({ ...base, panel: { ...panel, audience: 'x'.repeat(300) } })).not.toBeNull()
  })
})
