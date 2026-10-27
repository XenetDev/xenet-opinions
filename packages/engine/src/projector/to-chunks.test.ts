import { describe, expect, it } from 'vitest'
import { EVENT_KINDS, partIdFor } from '../events'
import { eventToChunks } from './to-chunks'

describe('eventToChunks', () => {
  it('maps stage', () => {
    const payload = { stage: 'ontology', status: 'running' }
    expect(eventToChunks({ kind: 'stage', partId: 'stage:ontology', payload })).toEqual([
      { type: 'data-stage', id: 'stage:ontology', data: payload },
    ])
  })

  it('maps ontology', () => {
    const payload = { entityTypes: ['A'], relationTypes: ['R'] }
    expect(eventToChunks({ kind: 'ontology', partId: 'ontology', payload })).toEqual([
      { type: 'data-ontology', id: 'ontology', data: payload },
    ])
  })

  it('maps graph', () => {
    const payload = { graphId: 'g', nodeCount: 0, edgeCount: 0, nodes: [], links: [] }
    expect(eventToChunks({ kind: 'graph', partId: 'graph', payload })).toEqual([
      { type: 'data-graph', id: 'graph', data: payload },
    ])
  })

  it('maps agents', () => {
    const payload = { count: 0, profiles: [] }
    expect(eventToChunks({ kind: 'agents', partId: 'agents', payload })).toEqual([
      { type: 'data-agents', id: 'agents', data: payload },
    ])
  })

  it('maps sim_feed', () => {
    const payload = { round: 1, totalRounds: 2, twitterActs: 0, redditActs: 0, posts: [] }
    expect(eventToChunks({ kind: 'sim_feed', partId: 'sim_feed', payload })).toEqual([
      { type: 'data-sim_feed', id: 'sim_feed', data: payload },
    ])
  })

  it('maps report_outline', () => {
    const payload = { sections: [] }
    expect(eventToChunks({ kind: 'report_outline', partId: 'report_outline', payload })).toEqual([
      { type: 'data-report_outline', id: 'report_outline', data: payload },
    ])
  })

  it('maps report_event', () => {
    const payload = { n: 3, action: 'a', summary: 's' }
    expect(eventToChunks({ kind: 'report_event', partId: 'report_event:3', payload })).toEqual([
      { type: 'data-report_event', id: 'report_event:3', data: payload },
    ])
  })

  it('maps sources', () => {
    const payload = { files: [] }
    expect(eventToChunks({ kind: 'sources', partId: 'sources', payload })).toEqual([
      { type: 'data-sources', id: 'sources', data: payload },
    ])
  })

  it('maps report_text', () => {
    expect(eventToChunks({ kind: 'report_text', partId: 'report', payload: { markdown: '# Hi' } })).toEqual([
      { type: 'text-start', id: 'report' },
      { type: 'text-delta', id: 'report', delta: '# Hi' },
      { type: 'text-end', id: 'report' },
    ])
  })

  it('maps error', () => {
    expect(
      eventToChunks({ kind: 'error', partId: null, payload: { stage: 'sim_run', code: 'E', message: 'boom' } }),
    ).toEqual([{ type: 'error', errorText: 'boom' }])
  })

  it('maps done', () => {
    expect(eventToChunks({ kind: 'done', partId: null, payload: {} })).toEqual([{ type: 'finish' }])
  })
})

describe('eventToChunks cancelled', () => {
  it('maps cancelled to abort then finish', () => {
    expect(
      eventToChunks({ kind: 'cancelled', partId: null, payload: { stage: 'sim_run', message: 'Cancelled by user' } }),
    ).toEqual([{ type: 'abort', reason: 'Cancelled by user' }, { type: 'finish' }])
  })
})

describe('partIdFor', () => {
  it('returns the part id per kind', () => {
    expect(EVENT_KINDS).toHaveLength(14)
    expect(partIdFor('stage', { stage: 'sim_run', status: 'running' })).toBe('stage:sim_run')
    expect(partIdFor('ontology', {})).toBe('ontology')
    expect(partIdFor('graph', {})).toBe('graph')
    expect(partIdFor('agents', {})).toBe('agents')
    expect(partIdFor('sim_feed', {})).toBe('sim_feed')
    expect(partIdFor('report_outline', {})).toBe('report_outline')
    expect(partIdFor('report_event', { n: 7 })).toBe('report_event:7')
    expect(partIdFor('sources', {})).toBe('sources')
    expect(partIdFor('report_text', { markdown: '' })).toBe('report')
    expect(partIdFor('interview_window', {})).toBe('interview_window')
    expect(partIdFor('interview', { id: 'iv_1' })).toBe('interview:iv_1')
    expect(partIdFor('error', {})).toBeNull()
    expect(partIdFor('done', {})).toBeNull()
    expect(partIdFor('cancelled', {})).toBeNull()
  })
})
