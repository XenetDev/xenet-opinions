import { readFileSync } from 'node:fs'
import type { AgentLogPage, OntologyResult } from '@xo/mirofish'
import { describe, expect, it } from 'vitest'
import {
  agentLogToEvents,
  configToPlatform,
  graphDataToPart,
  ontologyToPart,
  postsToFeed,
  profilesToPart,
  runStatusToFeed,
} from './mirofish-map'

const fixture = <T>(name: string): T =>
  (
    JSON.parse(readFileSync(new URL(`../../../mirofish/src/fixtures/${name}.json`, import.meta.url), 'utf8')) as {
      data: T
    }
  ).data
const agentLog = fixture<AgentLogPage>('report.agent-log.mock')
const realAgentLog = fixture<AgentLogPage>('report.agent-log')
const ontology = fixture<OntologyResult>('graph.ontology.generate')

describe('ontologyToPart', () => {
  it('maps entity and edge type names and the summary', () => {
    expect(ontologyToPart(ontology)).toEqual({
      entityTypes: ['Customer', 'Competitor'],
      relationTypes: ['SWITCHES_TO'],
      summary: 'The documents describe a planned 20% price increase and its likely reception.',
    })
  })
})

describe('graphDataToPart', () => {
  it('caps nodes at 200 and drops edges touching unsampled nodes', () => {
    const nodes = Array.from({ length: 250 }, (_, i) => ({ uuid: `n${i}`, name: `Node ${i}`, labels: ['Customer'] }))
    const edges = [
      { uuid: 'e1', source_node_uuid: 'n0', target_node_uuid: 'n1', name: 'KNOWS' },
      { uuid: 'e2', source_node_uuid: 'n0', target_node_uuid: 'n240', name: 'KNOWS' },
      { uuid: 'e3', source_node_uuid: 'n230', target_node_uuid: 'n2', name: 'KNOWS' },
      { uuid: 'e4', source_node_uuid: 'n199', target_node_uuid: 'n3' },
    ]
    const part = graphDataToPart('g1', { nodes, edges })
    expect(part.graphId).toBe('g1')
    expect(part.nodeCount).toBe(250)
    expect(part.edgeCount).toBe(4)
    expect(part.nodes).toHaveLength(200)
    expect(part.nodes[0]).toEqual({ id: 'n0', label: 'Node 0', type: 'Customer' })
    expect(part.links).toEqual([
      { source: 'n0', target: 'n1', label: 'KNOWS' },
      { source: 'n199', target: 'n3' },
    ])
  })
})

describe('profilesToPart', () => {
  it('maps realtime profiles', () => {
    const part = profilesToPart({
      profiles: [{ agent_id: 0, name: 'Maya Chen', handle: 'maya', role: 'Lead', bio: 'b', topics: ['pricing'] }, {}],
      total_expected: 12,
    })
    expect(part.count).toBe(2)
    expect(part.expected).toBe(12)
    expect(part.profiles[0]).toEqual({
      id: '0',
      name: 'Maya Chen',
      handle: 'maya',
      role: 'Lead',
      bio: 'b',
      topics: ['pricing'],
    })
    expect(part.profiles[1]).toMatchObject({ id: '1', name: 'Agent 2', topics: [] })
  })
})

describe('configToPlatform', () => {
  const realistic = (config: Record<string, unknown>) => ({
    simulation_id: 'sim_1',
    file_exists: true,
    is_generating: false,
    status: 'ready',
    generation_stage: 'completed',
    config_generated: true,
    config: { simulation_id: 'sim_1', agent_configs: [], ...config },
    summary: { total_agents: 0 },
  })
  const cfg = (platform: string) => ({ platform, recency_weight: 0.3 })

  it('prefers reddit when both are enabled, else the one enabled from the simulation config', () => {
    expect(configToPlatform(realistic({ twitter_config: cfg('twitter'), reddit_config: cfg('reddit') }))).toBe(
      'twitter',
    )
    expect(configToPlatform(realistic({ twitter_config: null, reddit_config: cfg('reddit') }))).toBe('reddit')
    expect(configToPlatform(realistic({ twitter_config: cfg('twitter'), reddit_config: null }))).toBe('twitter')
  })

  it("falls back to reddit, MiroFish's default", () => {
    expect(configToPlatform(realistic({ twitter_config: null, reddit_config: null }))).toBe('reddit')
    expect(configToPlatform({ file_exists: false, config: null })).toBe('reddit')
    expect(configToPlatform({})).toBe('reddit')
    expect(configToPlatform(null)).toBe('reddit')
  })
})

describe('posts and feed', () => {
  it('accepts a posts envelope or a bare array', () => {
    const post = { post_id: 'twitter_1_0', agent_name: 'Maya', content: 'hi', round: 1, platform: 'twitter' }
    expect(postsToFeed({ posts: [post], total: 1 }, 'twitter')).toEqual([
      { id: 'twitter_1_0', platform: 'twitter', agent: 'Maya', content: 'hi', round: 1 },
    ])
    expect(postsToFeed([post], 'reddit')[0]?.platform).toBe('reddit')
    expect(postsToFeed({}, 'twitter')).toEqual([])
  })

  it('keeps the last 50 posts and prefers status counters', () => {
    const mk = (i: number) => ({ id: `p${i}`, platform: 'twitter' as const, agent: 'a', content: 'c', round: 1 })
    const prev = {
      round: 1,
      totalRounds: 3,
      twitterActs: 40,
      redditActs: 0,
      posts: Array.from({ length: 40 }, (_, i) => mk(i)),
    }
    const next = runStatusToFeed(
      prev,
      { runner_status: 'running', current_round: 2, total_rounds: 3 },
      Array.from({ length: 20 }, (_, i) => mk(40 + i)),
    )
    expect(next.posts).toHaveLength(50)
    expect(next.posts[0]?.id).toBe('p10')
    expect(next.round).toBe(2)
    expect(next.twitterActs).toBe(60)
    const counted = runStatusToFeed(
      undefined,
      { runner_status: 'running', current_round: 1, twitter_actions_count: 9, reddit_actions_count: 4 },
      [],
    )
    const mixed = runStatusToFeed(undefined, { runner_status: 'running' }, [
      { ...mk(1), round: 2 },
      { ...mk(2), platform: 'reddit', round: 1 },
    ])
    expect(mixed.posts.map((p) => p.id)).toEqual(['p2', 'p1'])
    expect(counted).toMatchObject({ round: 1, totalRounds: 0, twitterActs: 9, redditActs: 4, posts: [] })
  })
})

describe('agentLogToEvents', () => {
  it('maps the Phase 0 agent-log fixture', () => {
    const { outline, events, complete } = agentLogToEvents(agentLog.logs, 0)
    expect(complete).toBe(true)
    expect(outline?.title).toBe('Reaction to the 20% price increase')
    expect(outline?.sections).toEqual([
      { index: 1, title: 'Overall sentiment', status: 'done' },
      { index: 2, title: 'Churn risk by segment', status: 'done' },
    ])
    expect(events.map((e) => [e.n, e.action, e.summary])).toEqual([
      [0, 'planning_complete', 'Outline ready (2 sections)'],
      [1, 'section_start', 'Writing: Overall sentiment'],
      [2, 'tool_call', 'Called quick_search'],
      [3, 'tool_result', 'Found 6 relevant facts'],
      [4, 'llm_response', 'Thinking (iteration 2)'],
      [5, 'section_complete', 'Finished: Overall sentiment'],
      [6, 'report_complete', 'Report complete'],
    ])
    expect(events[2]).toMatchObject({
      sectionIndex: 1,
      sectionTitle: 'Overall sentiment',
      toolName: 'quick_search',
      elapsedSeconds: 11.1,
    })
  })

  it('maps the agent log captured from a real MiroFish run', () => {
    const { outline, events, complete } = agentLogToEvents(realAgentLog.logs, 0)
    expect(complete).toBe(true)
    expect(outline?.sections.length).toBeGreaterThan(0)
    expect(outline?.sections.every((s) => s.status === 'done')).toBe(true)
    expect(events.length).toBeGreaterThan(0)
  })

  it('continues numbering and outline state across pages', () => {
    const logs = agentLog.logs
    const first = agentLogToEvents(logs.slice(0, 4), 0)
    expect(first.complete).toBe(false)
    expect(first.outline?.sections.map((s) => s.status)).toEqual(['writing', 'pending'])
    const second = agentLogToEvents(logs.slice(4), first.events.length, first.outline)
    expect(second.events[0]?.n).toBe(2)
    expect(second.outline?.sections.map((s) => s.status)).toEqual(['done', 'done'])
    expect(agentLogToEvents([{ action: 'section_content' }], 9, first.outline).outline).toBeUndefined()
  })

  it('treats null section fields from the real agent log as absent', () => {
    const { outline, events } = agentLogToEvents(
      [
        { action: 'report_start', section_index: null, section_title: null, details: {} },
        { action: 'section_start', section_index: null, section_title: null },
      ],
      0,
    )
    expect(outline).toBeUndefined()
    for (const e of events) {
      expect(e).not.toHaveProperty('sectionIndex')
      expect(e).not.toHaveProperty('sectionTitle')
    }
  })

  it('applies the summary rules', () => {
    const long = 'x'.repeat(300)
    const { events } = agentLogToEvents(
      [
        { action: 'tool_result', details: { tool_name: 'deep_search', result: long } },
        { action: 'tool_result', details: { tool_name: 'deep_search', result: { facts: [] } } },
        { action: 'section_start', section_index: 3, section_title: 'Risks' },
        { action: 'error', details: { error: 'LLM timeout' } },
        { action: 'report_start' },
      ],
      5,
    )
    expect(events.map((e) => e.summary)).toEqual([
      'x'.repeat(160),
      'deep_search returned',
      'Writing: Risks',
      'LLM timeout',
    ])
    expect(events.map((e) => e.n)).toEqual([5, 6, 7, 8])
  })
})
