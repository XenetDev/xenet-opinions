import { RUN_STAGES } from '@xo/db'
import { describe, expect, it } from 'vitest'
import {
  AgentsDataSchema,
  ErrorDataSchema,
  GraphDataSchema,
  InterviewDataSchema,
  InterviewWindowDataSchema,
  interviewPartId,
  OntologyDataSchema,
  QueueDataSchema,
  ReportEventDataSchema,
  ReportOutlineDataSchema,
  SimFeedDataSchema,
  SourcesDataSchema,
  STAGES,
  StageDataSchema,
  stagePartId,
} from './parts'

describe('parts', () => {
  it('accepts a cancelled stage status', () => {
    expect(StageDataSchema.safeParse({ stage: 'sim_run', status: 'cancelled' }).success).toBe(true)
  })

  it('builds stage part ids', () => {
    expect(stagePartId('ontology')).toBe('stage:ontology')
  })

  it('lists eight stages with interviews between sim_run and report', () => {
    expect(STAGES).toEqual([
      'ontology',
      'graph_build',
      'sim_create',
      'sim_prepare',
      'sim_run',
      'interviews',
      'report',
      'finished',
    ])
  })

  it('matches the db stages', () => {
    expect([...STAGES]).toEqual([...RUN_STAGES])
  })

  it('parses stage data', () => {
    expect(StageDataSchema.parse({ stage: 'sim_run', status: 'running', progress: 0.5 })).toEqual({
      stage: 'sim_run',
      status: 'running',
      progress: 0.5,
    })
  })

  it('parses ontology data', () => {
    const d = { entityTypes: ['Person'], relationTypes: ['KNOWS'], summary: 's' }
    expect(OntologyDataSchema.parse(d)).toEqual(d)
  })

  it('parses graph data', () => {
    const d = {
      graphId: 'g1',
      nodeCount: 2,
      edgeCount: 1,
      nodes: [
        { id: 'a', label: 'A', type: 'Person' },
        { id: 'b', label: 'B' },
      ],
      links: [{ source: 'a', target: 'b', label: 'KNOWS' }],
    }
    expect(GraphDataSchema.parse(d)).toEqual(d)
  })

  it('parses agents data', () => {
    const d = {
      count: 1,
      expected: 3,
      profiles: [{ id: 'p1', name: 'Ann', handle: '@ann', role: 'r', bio: 'b', topics: ['t'] }],
    }
    expect(AgentsDataSchema.parse(d)).toEqual(d)
    expect(AgentsDataSchema.parse({ ...d, platform: 'reddit' })).toEqual({ ...d, platform: 'reddit' })
    expect(AgentsDataSchema.safeParse({ ...d, platform: 'parallel' }).success).toBe(false)
  })

  it('parses sim feed data', () => {
    const d = {
      round: 1,
      totalRounds: 5,
      twitterActs: 2,
      redditActs: 1,
      posts: [{ id: 'x', platform: 'twitter' as const, agent: 'Ann', content: 'hi', round: 1 }],
    }
    expect(SimFeedDataSchema.parse(d)).toEqual(d)
  })

  it('parses report outline data', () => {
    const d = { title: 'T', sections: [{ index: 0, title: 'S', status: 'pending' as const }] }
    expect(ReportOutlineDataSchema.parse(d)).toEqual(d)
  })

  it('parses report event data', () => {
    const d = {
      n: 1,
      action: 'tool_call',
      sectionIndex: 0,
      sectionTitle: 'S',
      toolName: 'search',
      summary: 'x',
      elapsedSeconds: 2,
    }
    expect(ReportEventDataSchema.parse(d)).toEqual(d)
  })

  it('parses sources data', () => {
    const d = { files: [{ id: 'f1', filename: 'a.pdf', mediaType: 'application/pdf', sizeBytes: 10 }] }
    expect(SourcesDataSchema.parse(d)).toEqual(d)
  })

  it('parses error data', () => {
    const d = { stage: 'graph_build' as const, code: 'E', message: 'boom' }
    expect(ErrorDataSchema.parse(d)).toEqual(d)
  })

  it('parses interview data and builds part ids', () => {
    const d = {
      id: 'iv_1',
      questionId: 'q_1',
      agentId: '3',
      agentName: 'Ada',
      question: 'Why?',
      status: 'done' as const,
      answer: 'Because',
    }
    expect(InterviewDataSchema.parse(d)).toEqual(d)
    expect(InterviewDataSchema.safeParse({ ...d, status: 'nope' }).success).toBe(false)
    expect(InterviewDataSchema.safeParse({ ...d, id: undefined }).success).toBe(false)
    expect(InterviewDataSchema.safeParse({ ...d, questionId: undefined }).success).toBe(false)
    expect(interviewPartId('iv_1')).toBe('interview:iv_1')
  })

  it('parses interview window data', () => {
    const open = { until: '2026-10-27T12:20:00.000Z', personaCount: 2, closed: false }
    expect(InterviewWindowDataSchema.parse(open)).toEqual(open)
    const closed = { until: null, personaCount: 2, closed: true, reason: 'environment_stopped' as const }
    expect(InterviewWindowDataSchema.parse(closed)).toEqual(closed)
    expect(InterviewWindowDataSchema.safeParse({ ...closed, reason: 'other' }).success).toBe(false)
    expect(InterviewWindowDataSchema.safeParse({ ...open, personaCount: 1.5 }).success).toBe(false)
  })

  it('parses queue data and rejects negative positions', () => {
    expect(QueueDataSchema.parse({ position: 0 })).toEqual({ position: 0 })
    expect(QueueDataSchema.safeParse({ position: -1 }).success).toBe(false)
    expect(QueueDataSchema.safeParse({ position: 1.5 }).success).toBe(false)
  })
})
