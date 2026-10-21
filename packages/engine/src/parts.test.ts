import { RUN_STAGES } from '@xo/db'
import { describe, expect, it } from 'vitest'
import {
  AgentsDataSchema,
  ErrorDataSchema,
  GraphDataSchema,
  OntologyDataSchema,
  ReportEventDataSchema,
  ReportOutlineDataSchema,
  SimFeedDataSchema,
  SourcesDataSchema,
  STAGES,
  StageDataSchema,
  stagePartId,
} from './parts'

describe('parts', () => {
  it('builds stage part ids', () => {
    expect(stagePartId('ontology')).toBe('stage:ontology')
  })

  it('lists seven stages starting with ontology', () => {
    expect(STAGES).toHaveLength(7)
    expect(STAGES[0]).toBe('ontology')
  })

  it('matches the db stages', () => {
    expect([...STAGES]).toEqual([...RUN_STAGES])
  })

  it('parses stage data', () => {
    expect(StageDataSchema.parse({ stage: 'sim_run', status: 'running', progress: 0.5 })).toEqual({ stage: 'sim_run', status: 'running', progress: 0.5 })
  })

  it('parses ontology data', () => {
    const d = { entityTypes: ['Person'], relationTypes: ['KNOWS'], summary: 's' }
    expect(OntologyDataSchema.parse(d)).toEqual(d)
  })

  it('parses graph data', () => {
    const d = { graphId: 'g1', nodeCount: 2, edgeCount: 1, nodes: [{ id: 'a', label: 'A', type: 'Person' }, { id: 'b', label: 'B' }], links: [{ source: 'a', target: 'b', label: 'KNOWS' }] }
    expect(GraphDataSchema.parse(d)).toEqual(d)
  })

  it('parses agents data', () => {
    const d = { count: 1, expected: 3, profiles: [{ id: 'p1', name: 'Ann', handle: '@ann', role: 'r', bio: 'b', topics: ['t'] }] }
    expect(AgentsDataSchema.parse(d)).toEqual(d)
  })

  it('parses sim feed data', () => {
    const d = { round: 1, totalRounds: 5, twitterActs: 2, redditActs: 1, posts: [{ id: 'x', platform: 'twitter' as const, agent: 'Ann', content: 'hi', round: 1 }] }
    expect(SimFeedDataSchema.parse(d)).toEqual(d)
  })

  it('parses report outline data', () => {
    const d = { title: 'T', sections: [{ index: 0, title: 'S', status: 'pending' as const }] }
    expect(ReportOutlineDataSchema.parse(d)).toEqual(d)
  })

  it('parses report event data', () => {
    const d = { n: 1, action: 'tool_call', sectionIndex: 0, sectionTitle: 'S', toolName: 'search', summary: 'x', elapsedSeconds: 2 }
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
})
