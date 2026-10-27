import { describe, expect, it } from 'vitest'
import type { Http, RequestInitOptions } from '../client'
import { createMiroFishClient, createMiroFishClientFromHttp } from '../index'

const nth = <T>(a: T[], i: number): T => {
  const v = a[i]
  if (v === undefined) throw new Error(`missing item ${i}`)
  return v
}
const first = <T>(a: T[]): T => nth(a, 0)

type Call = { url: URL; init: RequestInit }

const ok = (data: unknown) =>
  new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

const stubbed = (data: unknown = {}) => {
  const calls: Call[] = []
  const fetchStub = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: new URL(String(url)), init: init ?? {} })
    return ok(data)
  }) as typeof fetch
  const client = createMiroFishClient({ baseUrl: 'http://mf.test', fetch: fetchStub })
  return { client, calls }
}

const body = (c: Call) => JSON.parse(String(c.init.body))

type HttpCall = { kind: string; path: string; init?: RequestInitOptions }

const spied = () => {
  const calls: HttpCall[] = []
  const record =
    (kind: string) =>
    async (path: string, ...rest: unknown[]) => {
      const init = rest[rest.length - 1] as RequestInitOptions | undefined
      calls.push({ kind, path, init: init && typeof init === 'object' && !('parse' in init) ? init : undefined })
      return {} as never
    }
  const http: Http = {
    getJson: record('get') as Http['getJson'],
    postJson: record('postJson') as Http['postJson'],
    postForm: record('postForm') as Http['postForm'],
  }
  return { client: createMiroFishClientFromHttp(http), calls }
}

describe('graph endpoints', () => {
  it('generateOntology posts multipart with repeated files fields', async () => {
    const { client, calls } = stubbed({ project_id: 'proj_aaaaaaaaaaaa', ontology: {} })
    await client.graph.generateOntology({
      files: [
        { name: 'a.md', bytes: new Uint8Array([1, 2]), type: 'text/markdown' },
        { name: 'b.txt', bytes: new Uint8Array([3]), type: 'text/plain' },
      ],
      requirement: 'predict',
      projectName: 'P',
      additionalContext: 'ctx',
    })
    const c = first(calls)
    expect(c.init.method).toBe('POST')
    expect(c.url.pathname).toBe('/api/graph/ontology/generate')
    const form = c.init.body as FormData
    const files = form.getAll('files') as File[]
    expect(files.map((f) => f.name)).toEqual(['a.md', 'b.txt'])
    expect(first(files).type).toBe('text/markdown')
    expect(form.get('simulation_requirement')).toBe('predict')
    expect(form.get('project_name')).toBe('P')
    expect(form.get('additional_context')).toBe('ctx')
  })

  it('generateOntology omits optional fields when absent', async () => {
    const { client, calls } = stubbed({ project_id: 'p', ontology: {} })
    await client.graph.generateOntology({ files: [], requirement: 'r' })
    const form = first(calls).init.body as FormData
    expect(form.has('project_name')).toBe(false)
    expect(form.has('additional_context')).toBe(false)
  })

  it('build posts project_id and force', async () => {
    const { client, calls } = stubbed({ project_id: 'p' })
    await client.graph.build({ projectId: 'p', force: true })
    expect(first(calls).init.method).toBe('POST')
    expect(first(calls).url.pathname).toBe('/api/graph/build')
    expect(body(first(calls))).toEqual({ project_id: 'p', force: true })
  })

  it('getTask, getData, getProject use GET paths', async () => {
    const { client, calls } = stubbed({
      task_id: 't',
      status: 'pending',
      progress: 0,
      nodes: [],
      edges: [],
      project_id: 'p',
    })
    await client.graph.getTask('t1')
    await client.graph.getData('g1')
    await client.graph.getProject('p1')
    expect(calls.map((c) => c.init.method)).toEqual(['GET', 'GET', 'GET'])
    expect(calls.map((c) => c.url.pathname)).toEqual([
      '/api/graph/task/t1',
      '/api/graph/data/g1',
      '/api/graph/project/p1',
    ])
  })
})

describe('simulation endpoints', () => {
  it('create sends both platforms enabled', async () => {
    const { client, calls } = stubbed({ simulation_id: 's', project_id: 'p', status: 'created' })
    await client.simulation.create({ projectId: 'p', graphId: 'g' })
    expect(first(calls).url.pathname).toBe('/api/simulation/create')
    expect(body(first(calls))).toEqual({ project_id: 'p', graph_id: 'g', enable_twitter: true, enable_reddit: true })
  })

  it('prepare sends profile generation settings', async () => {
    const { client, calls } = stubbed({ simulation_id: 's' })
    await client.simulation.prepare({ simulationId: 's' })
    expect(first(calls).url.pathname).toBe('/api/simulation/prepare')
    expect(body(first(calls))).toEqual({ simulation_id: 's', use_llm_for_profiles: true, parallel_profile_count: 5 })
  })

  it('prepareStatus is a POST with ids', async () => {
    const { client, calls } = stubbed({ task_id: 't', status: 'pending', progress: 0 })
    await client.simulation.prepareStatus({ simulationId: 's', taskId: 't' })
    expect(first(calls).init.method).toBe('POST')
    expect(first(calls).url.pathname).toBe('/api/simulation/prepare/status')
    expect(body(first(calls))).toEqual({ simulation_id: 's', task_id: 't' })
  })

  it('profilesRealtime passes platform query', async () => {
    const { client, calls } = stubbed({ profiles: [] })
    await client.simulation.profilesRealtime('s', 'reddit')
    expect(first(calls).init.method).toBe('GET')
    expect(first(calls).url.pathname).toBe('/api/simulation/s/profiles/realtime')
    expect(first(calls).url.searchParams.get('platform')).toBe('reddit')
  })

  it('start sends parallel platform and flags', async () => {
    const { client, calls } = stubbed({ runner_status: 'starting' })
    await client.simulation.start({ simulationId: 's', maxRounds: 10 })
    expect(first(calls).url.pathname).toBe('/api/simulation/start')
    expect(body(first(calls))).toEqual({
      simulation_id: 's',
      platform: 'parallel',
      max_rounds: 10,
      force: true,
      enable_graph_memory_update: true,
    })
  })

  it('start omits max_rounds when not given', async () => {
    const { client, calls } = stubbed({ runner_status: 'starting' })
    await client.simulation.start({ simulationId: 's' })
    expect(body(first(calls))).not.toHaveProperty('max_rounds')
  })

  it('runStatus is GET', async () => {
    const { client, calls } = stubbed({ runner_status: 'idle' })
    await client.simulation.runStatus('s')
    expect(first(calls).init.method).toBe('GET')
    expect(first(calls).url.pathname).toBe('/api/simulation/s/run-status')
  })

  it('posts passes platform, limit, offset as query', async () => {
    const { client, calls } = stubbed({ posts: [] })
    await client.simulation.posts('s', { platform: 'twitter', limit: 20, offset: 40 })
    expect(first(calls).url.pathname).toBe('/api/simulation/s/posts')
    expect(Object.fromEntries(first(calls).url.searchParams)).toEqual({
      platform: 'twitter',
      limit: '20',
      offset: '40',
    })
  })

  it('posts rejects an invalid platform before any request', async () => {
    const { client, calls } = stubbed({})
    await expect(client.simulation.posts('s', { platform: '../etc' as never })).rejects.toThrow()
    expect(calls).toHaveLength(0)
  })

  it('stop and closeEnv post simulation_id', async () => {
    const { client, calls } = stubbed({})
    await client.simulation.stop('s')
    await client.simulation.closeEnv('s')
    expect(calls.map((c) => c.url.pathname)).toEqual(['/api/simulation/stop', '/api/simulation/close-env'])
    expect(body(first(calls))).toEqual({ simulation_id: 's' })
    expect(body(nth(calls, 1))).toEqual({ simulation_id: 's' })
  })

  it('interviewBatch maps agentId to agent_id', async () => {
    const { client, calls } = stubbed({})
    await client.simulation.interviewBatch({ simulationId: 's', interviews: [{ agentId: 3, prompt: 'hi' }] })
    expect(first(calls).url.pathname).toBe('/api/simulation/interview/batch')
    expect(body(first(calls))).toEqual({ simulation_id: 's', interviews: [{ agent_id: 3, prompt: 'hi' }] })
  })

  it('interviewBatch sends platform and timeout when given', async () => {
    const { client, calls } = stubbed({})
    await client.simulation.interviewBatch({
      simulationId: 's',
      interviews: [{ agentId: 3, prompt: 'hi' }],
      platform: 'twitter',
      timeout: 240,
    })
    expect(body(first(calls))).toMatchObject({ platform: 'twitter', timeout: 240 })
  })

  it('interviewBatch omits platform and timeout when undefined', async () => {
    const { client, calls } = stubbed({})
    await client.simulation.interviewBatch({ simulationId: 's', interviews: [{ agentId: 3, prompt: 'hi' }] })
    expect(Object.keys(body(first(calls)))).toEqual(['simulation_id', 'interviews'])
  })

  it('configRealtime is GET /config/realtime', async () => {
    const { client, calls } = stubbed({ config: { reddit_config: { platform: 'reddit' } } })
    await client.simulation.configRealtime('s 1')
    expect(first(calls).init.method).toBe('GET')
    expect(first(calls).url.pathname).toBe('/api/simulation/s%201/config/realtime')
  })
})

describe('report endpoints', () => {
  it('generate posts force_regenerate', async () => {
    const { client, calls } = stubbed({ simulation_id: 's', report_id: 'r', status: 'generating' })
    await client.report.generate({ simulationId: 's', forceRegenerate: true })
    expect(first(calls).url.pathname).toBe('/api/report/generate')
    expect(body(first(calls))).toEqual({ simulation_id: 's', force_regenerate: true })
  })

  it('get is GET /api/report/:id', async () => {
    const { client, calls } = stubbed({ report_id: 'r', simulation_id: 's', status: 'pending' })
    await client.report.get('r1')
    expect(first(calls).init.method).toBe('GET')
    expect(first(calls).url.pathname).toBe('/api/report/r1')
  })

  it('agentLog passes from_line', async () => {
    const { client, calls } = stubbed({ logs: [], total_lines: 0, from_line: 7, has_more: false })
    await client.report.agentLog('r1', 7)
    expect(first(calls).url.pathname).toBe('/api/report/r1/agent-log')
    expect(first(calls).url.searchParams.get('from_line')).toBe('7')
  })

  it('chat maps history to chat_history', async () => {
    const { client, calls } = stubbed({ response: 'ok' })
    await client.report.chat({ simulationId: 's', message: 'm', history: [{ role: 'user', content: 'x' }] })
    expect(first(calls).url.pathname).toBe('/api/report/chat')
    expect(body(first(calls))).toEqual({
      simulation_id: 's',
      message: 'm',
      chat_history: [{ role: 'user', content: 'x' }],
    })
  })
})

describe('timeouts', () => {
  const timeoutOf = (calls: HttpCall[]) => first(calls).init?.timeoutMs

  it('ontology uses 600_000', async () => {
    const { client, calls } = spied()
    await client.graph.generateOntology({ files: [], requirement: 'r' })
    expect(first(calls).kind).toBe('postForm')
    expect(timeoutOf(calls)).toBe(600_000)
  })

  it('interview batch uses 200_000', async () => {
    const { client, calls } = spied()
    await client.simulation.interviewBatch({ simulationId: 's', interviews: [] })
    expect(timeoutOf(calls)).toBe(200_000)
  })

  it('report chat uses 180_000', async () => {
    const { client, calls } = spied()
    await client.report.chat({ simulationId: 's', message: 'm', history: [] })
    expect(timeoutOf(calls)).toBe(180_000)
  })

  it('caller timeoutMs override wins', async () => {
    const { client, calls } = spied()
    await client.report.chat({ simulationId: 's', message: 'm', history: [] }, { timeoutMs: 5 })
    expect(timeoutOf(calls)).toBe(5)
  })

  it('undefined timeoutMs still uses the default', async () => {
    const { client, calls } = spied()
    await client.graph.generateOntology({ files: [], requirement: 'r' }, { timeoutMs: undefined })
    expect(timeoutOf(calls)).toBe(600_000)
  })

  it('other calls leave the default timeout', async () => {
    const { client, calls } = spied()
    await client.report.get('r')
    expect(timeoutOf(calls)).toBeUndefined()
  })
})
