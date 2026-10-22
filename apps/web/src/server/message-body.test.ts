import { describe, expect, it } from 'vitest'
import { parseMessageBody } from './message-body'

const base = { id: 'c1', message: { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hi' }] } }

describe('parseMessageBody follow-up fields', () => {
  it('defaults target to report and agentIds to empty', () => {
    const body = parseMessageBody(base)
    expect(body?.target).toBe('report')
    expect(body?.agentIds).toEqual([])
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
