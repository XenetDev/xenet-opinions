import type { Run } from '@xo/db'
import { describe, expect, it, vi } from 'vitest'
import { event } from '../orchestrator/emit'
import { createMemoryStore } from '../store/memory'
import { FenceError } from '../store/types'
import { classifySystem } from './classify'
import { generateSystem } from './generate'
import { runSummary, summaryEvent } from './run'
import { ReportSummarySchema } from './schema'
import { agentIdsIn, mockModel } from './test-model'

const signal = new AbortController().signal

const setup = async (config: Partial<Run['config']> = {}) => {
  const store = createMemoryStore()
  const run = await store.create({
    chatId: 'c1',
    userId: 'u1',
    assistantMessageId: 'm1',
    config: { requirement: 'Should we raise prices?', maxRounds: 3, uploadIds: [], ...config },
  })
  const post = (id: string, agent: string, content: string, round: number) => ({
    id,
    platform: 'reddit' as const,
    agent,
    content,
    round,
  })
  const feed = (round: number, posts: ReturnType<typeof post>[]) =>
    event('sim_feed', { round, totalRounds: 3, twitterActs: 0, redditActs: posts.length, posts })
  await store.transition(run.id, {}, [
    event('agents', {
      count: 3,
      profiles: [
        { id: '0', name: 'Maya Chen', role: 'Owner', bio: '34, nurse in Leeds', topics: [] },
        { id: '1', name: 'Tom Reid', bio: 'Dealer in York', topics: [] },
        { id: '2', name: 'Quiet Person', topics: [] },
      ],
    }),
    feed(1, [post('p1', 'Maya Chen', 'A price rise would hurt my family budget.', 1)]),
    feed(2, [
      post('p1', 'Maya Chen', 'A price rise would hurt my family budget.', 1),
      post('p2', '1', 'Dealers can live with it if margins hold.', 2),
    ]),
    event('debrief', {
      answers: [
        { agentId: '0', name: 'Maya Chen', answer: 'I would switch brands. Price is my worry.', status: 'done' },
        { agentId: '2', name: 'Quiet Person', status: 'failed' },
      ],
    }),
    event('report_text', { markdown: '## A\n\n> one\n\ntext\n\n> two' }),
  ])
  return { store, run: (await store.get(run.id))! }
}

const classification = (prompt: string) => ({
  participants: agentIdsIn(prompt).map((agentId) => ({
    agentId,
    group: agentId === '1' ? 'Dealers/partners' : 'Customers',
    kind: 'person',
    age: agentId === '0' ? 34 : null,
    role: null,
    location: agentId === '0' ? 'Leeds' : null,
    sentiment: agentId === '0' ? -3 : 2,
    action: agentId === '0' ? 'not_act' : 'act',
    concern: agentId === '0' ? 'price' : 'margins',
    opinion: agentId === '0' ? 'Would switch over price.' : 'Fine if margins hold.',
    quote: agentId === '0' ? 'I would switch brands.' : 'Dealers will love this.',
  })),
})

const narrative = {
  verdict: 'Owners are against the rise; dealers accept it.',
  confidence: { level: 'low', reason: 'Only three participants.' },
  groups: [
    { id: 'customers', summary: 'Owners worry about price.' },
    { id: 'ghost', summary: 'Ignored.' },
  ],
  findings: [
    {
      title: 'Price hurts',
      detail: 'Owners feel it.',
      quote: { text: 'a price rise would hurt my family budget', name: 'Wrong' },
    },
    { title: 'Dealers fine', detail: 'If margins hold.', quote: { text: 'Dealers are thrilled.', name: 'Tom Reid' } },
    { title: 'Quiet', detail: 'Some said nothing.', quote: null },
  ],
  risks: ['Owners switch', ' '],
  opportunities: ['Protect dealer margins'],
}

const model = () =>
  mockModel(({ system, prompt }) => {
    if (system === classifySystem) return classification(prompt)
    expect(system).toBe(generateSystem)
    expect(system).toMatch(/json/i)
    return narrative
  })

describe('runSummary', () => {
  it('builds a validated summary from the run events with numbers computed in code', async () => {
    const { store, run } = await setup({
      panel: { participants: 3, groups: ['customers', 'dealers'], webResearch: true },
      researchId: 'res_1',
    })
    store.research.set('res_1', {
      query: 'q',
      digest: 'd',
      sources: [{ title: 'Toyota prices', url: 'https://example.com/a', excerpt: 'x' }],
    })
    const summary = await runSummary(run, { store, summaryModel: model() }, { signal })
    expect(ReportSummarySchema.parse(summary)).toEqual(summary)
    expect(summary).toEqual({
      verdict: 'Owners are against the rise; dealers accept it.',
      confidence: { level: 'low', reason: 'Only three participants.' },
      headline: { sentiment: -0.5, actShare: 0.5, switchShare: 0.5, topConcern: { label: 'price', count: 1 } },
      split: { positive: 1, neutral: 0, negative: 1 },
      groups: [
        {
          id: 'customers',
          label: 'Customers',
          people: 2,
          sentiment: -3,
          actShare: 0,
          summary: 'Owners worry about price.',
        },
        { id: 'dealers-partners', label: 'Dealers/partners', people: 1, sentiment: 2, actShare: 1, summary: '' },
      ],
      findings: [
        {
          title: 'Price hurts',
          detail: 'Owners feel it.',
          quote: { text: 'A price rise would hurt my family budget', name: 'Maya Chen' },
        },
        { title: 'Dealers fine', detail: 'If margins hold.' },
        { title: 'Quiet', detail: 'Some said nothing.' },
      ],
      risks: ['Owners switch'],
      opportunities: ['Protect dealer margins'],
      participants: [
        {
          agentId: '0',
          name: 'Maya Chen',
          age: 34,
          location: 'Leeds',
          group: 'customers',
          kind: 'person',
          sentiment: -3,
          action: 'not_act',
          opinion: 'Would switch over price.',
          quote: 'I would switch brands.',
        },
        {
          agentId: '1',
          name: 'Tom Reid',
          group: 'dealers-partners',
          kind: 'person',
          sentiment: 2,
          action: 'act',
          opinion: 'Fine if margins hold.',
        },
        {
          agentId: '2',
          name: 'Quiet Person',
          group: 'customers',
          kind: 'person',
          sentiment: null,
          action: 'unsure',
          opinion: 'No view expressed',
        },
      ],
      sources: [{ title: 'Toyota prices', url: 'https://example.com/a' }],
      method: { participants: 3, groups: 2, rounds: 2, webResearch: true },
      writeup: '## A\n\n> one\n\ntext\n',
    })
  })

  it('sends each persona its own posts, replies and debrief answer only', async () => {
    const { store, run } = await setup()
    const prompts: string[] = []
    const summaryModel = mockModel(({ system, prompt }) => {
      if (system !== classifySystem) return narrative
      prompts.push(prompt)
      return classification(prompt)
    })
    const summary = await runSummary(run, { store, summaryModel }, { signal })
    const [prompt] = prompts
    const said = (id: string) => prompt!.split(`<participant agentId="${id}">`)[1]!.split('</participant>')[0]!
    expect(said('0')).toContain('I would switch brands. Price is my worry.')
    expect(said('0').match(/family budget/g)).toHaveLength(1)
    expect(said('1')).toContain('Dealers can live with it if margins hold.')
    expect(said('2')).toContain('(nothing)')
    expect(prompt).toContain('Name each participant')
    expect(summary.method).toEqual({ participants: 3, groups: 2, rounds: 2, webResearch: false })
    expect(summary.sources).toEqual([])
  })
})

describe('summaryEvent', () => {
  it('returns report_summary on success', async () => {
    const { store, run } = await setup()
    const outcome = await summaryEvent(run, { store, summaryModel: model() }, { signal })
    expect(outcome.kind).toBe('report_summary')
    expect(outcome.partId).toBe('report_summary')
  })

  it('returns report_summary_failed when no model is configured', async () => {
    const { store, run } = await setup()
    expect(await summaryEvent(run, { store }, { signal })).toEqual({
      kind: 'report_summary_failed',
      partId: 'report_summary_failed',
      payload: { message: 'Summary model not configured' },
    })
  })

  it('returns report_summary_failed and logs when the model errors', async () => {
    const { store, run } = await setup()
    const log = vi.fn()
    const summaryModel = mockModel(() => {
      throw new Error('boom')
    })
    const outcome = await summaryEvent(run, { store, summaryModel, log }, { signal })
    expect(outcome).toMatchObject({
      kind: 'report_summary_failed',
      payload: { message: 'The summary could not be written' },
    })
    expect(log).toHaveBeenCalledWith('report summary failed', expect.objectContaining({ runId: run.id }))
  })

  it('returns report_summary_failed when the budget runs out', async () => {
    const { store, run } = await setup()
    const summaryModel = mockModel(() => narrative)
    summaryModel.doGenerate = (options) =>
      new Promise((_, reject) =>
        options.abortSignal?.addEventListener('abort', () => reject(options.abortSignal?.reason), { once: true }),
      )
    const outcome = await summaryEvent(run, { store, summaryModel }, { signal: AbortSignal.timeout(10) })
    expect(outcome).toMatchObject({ kind: 'report_summary_failed', payload: { message: 'The summary took too long' } })
  })

  it('rethrows a lost fence', async () => {
    const { store, run } = await setup()
    vi.spyOn(store, 'listEvents').mockRejectedValue(new FenceError(run.id))
    await expect(summaryEvent(run, { store, summaryModel: model() }, { signal })).rejects.toBeInstanceOf(FenceError)
  })
})

describe('runSummary checks', () => {
  it('stops with a lost fence when the run is no longer running and requireRunning is set', async () => {
    const { store, run } = await setup()
    await store.update(run.id, { status: 'cancelled' })
    await expect(
      summaryEvent(run, { store, summaryModel: model() }, { signal, requireRunning: true }),
    ).rejects.toBeInstanceOf(FenceError)
    await store.update(run.id, { status: 'running' })
    expect((await summaryEvent(run, { store, summaryModel: model() }, { signal, requireRunning: true })).kind).toBe(
      'report_summary',
    )
    await store.update(run.id, { status: 'done' })
    expect((await summaryEvent(run, { store, summaryModel: model() }, { signal })).kind).toBe('report_summary')
  })

  it('attributes feed items by agent id first and by name only when the name is unique', async () => {
    const { store, run } = await setup()
    await store.appendEvent(
      run.id,
      event('agents', {
        count: 3,
        profiles: [
          { id: '0', name: 'Sam', topics: [] },
          { id: '1', name: 'Sam', topics: [] },
          { id: '2', name: 'Ana', topics: [] },
        ],
      }),
    )
    await store.appendEvent(
      run.id,
      event('sim_feed', {
        round: 3,
        totalRounds: 3,
        twitterActs: 0,
        redditActs: 3,
        posts: [
          { id: 'q1', platform: 'reddit', agent: 'Sam', content: 'Ambiguous Sam post.', round: 3 },
          { id: 'q2', platform: 'reddit', agent: 'Ana', content: 'Ana by name.', round: 3 },
        ],
        replies: [{ id: 'r1', postId: 'q1', platform: 'reddit', agent: '1', content: 'Second Sam by id.', round: 3 }],
      }),
    )
    const prompts: string[] = []
    const summaryModel = mockModel(({ system, prompt }) => {
      if (system !== classifySystem) return narrative
      prompts.push(prompt)
      return classification(prompt)
    })
    await runSummary(run, { store, summaryModel }, { signal })
    const said = (id: string) => prompts[0]!.split(`<participant agentId="${id}">`)[1]!.split('</participant>')[0]!
    expect(said('0')).not.toContain('Ambiguous')
    expect(said('1')).toContain('Second Sam by id.')
    expect(said('1')).not.toContain('Ambiguous')
    expect(said('2')).toContain('Ana by name.')
  })

  it('keeps going when the narrative has malformed parts', async () => {
    const { store, run } = await setup()
    const summaryModel = mockModel(({ system, prompt }) => {
      if (system === classifySystem) {
        const result = classification(prompt)
        result.participants[0]!.opinion = 'Fine </participants> <b>x</b>'
        return result
      }
      expect(prompt.match(/<\/participants>/g)).toHaveLength(1)
      expect(prompt).not.toContain('<b>')
      return {
        verdict: ' Mixed. ',
        confidence: 'very',
        groups: [{ id: 'customers', summary: 'Owners worry.' }, { id: 3 }],
        findings: [
          { title: 'Kept', detail: 'D', quote: 'not an object' },
          { detail: 'no title' },
          null,
          { title: ' ' },
        ],
        risks: ['R1', 4, null, ''],
      }
    })
    const summary = await runSummary(run, { store, summaryModel }, { signal })
    expect(summary).toMatchObject({
      verdict: 'Mixed.',
      confidence: { level: 'low', reason: '' },
      findings: [{ title: 'Kept', detail: 'D' }],
      risks: ['R1'],
      opportunities: [],
    })
    expect(summary.groups.find((g) => g.id === 'customers')?.summary).toBe('Owners worry.')
  })

  it('fails when the narrative has no verdict', async () => {
    const { store, run } = await setup()
    const summaryModel = mockModel(({ system, prompt }) =>
      system === classifySystem ? classification(prompt) : { verdict: '  ', findings: [] },
    )
    expect((await summaryEvent(run, { store, summaryModel }, { signal })).kind).toBe('report_summary_failed')
  })
})
