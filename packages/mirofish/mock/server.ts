import { randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { pathToFileURL } from 'node:url'
import {
  PROFILE_COUNT,
  agentLogFixture,
  buildGraphData,
  buildPost,
  buildProfile,
  ontologyFixture,
  reportMarkdown,
} from './fixtures'
import { type FailStage, Timeline, createStore, hexId } from './state'

export type MockOptions = { port?: number; speed?: number; failStage?: FailStage; token?: string }

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

type Ctx = { params: Record<string, string>; query: URLSearchParams; body: Record<string, unknown>; req: IncomingMessage }
type Route = { method: string; pattern: string; regex: RegExp; names: string[]; handler: (ctx: Ctx) => unknown }

const FAILURE = 'Injected failure'
const AGENT_LOG_INTERVAL_MS = 500
const DEFAULT_MAX_ROUNDS = 5

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const compile = (method: string, pattern: string, handler: Route['handler']): Route => {
  const names: string[] = []
  const source = pattern.replace(/:(\w+)/g, (_, name: string) => {
    names.push(name)
    return '([^/]+)'
  })
  return { method, pattern, regex: new RegExp(`^${source}$`), names, handler }
}

const readBody = async (req: IncomingMessage) => {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const text = Buffer.concat(chunks).toString('utf8')
  if (!text) return {}
  try {
    const parsed: unknown = JSON.parse(text)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    throw new HttpError(400, 'invalid JSON body')
  }
}

const readForm = async (req: IncomingMessage) => {
  const headers = Object.fromEntries(Object.entries(req.headers).filter(([, v]) => typeof v === 'string')) as Record<string, string>
  try {
    return await new Response(req as unknown as ReadableStream, { headers, duplex: 'half' } as ResponseInit).formData()
  } catch {
    throw new HttpError(400, 'expected multipart/form-data')
  }
}

const send = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

export const startMockMiroFish = async (opts: MockOptions = {}) => {
  const speed = opts.speed && opts.speed > 0 ? opts.speed : 1
  const scale = (ms: number) => ms / speed
  const store = createStore()
  const calls: Record<string, number> = {}
  const fails = (stage: FailStage) => opts.failStage === stage

  const need = <T>(value: T | undefined, what: string): T => {
    if (value === undefined) throw new HttpError(404, `${what} not found`)
    return value
  }

  const taskView = (
    id: string,
    type: string,
    timeline: Timeline,
    stage: FailStage,
    result: () => unknown,
    extra: Record<string, unknown> = {},
  ) => {
    if (fails(stage)) {
      const progress = Math.min(99, Math.floor(timeline.progress * 100))
      return { task_id: id, task_type: type, status: 'failed', progress, message: FAILURE, result: null, error: FAILURE }
    }
    if (timeline.done) {
      return { task_id: id, task_type: type, status: 'completed', progress: 100, message: 'Completed', result: result(), error: null, ...extra }
    }
    const progress = Math.floor(timeline.progress * 100)
    return { task_id: id, task_type: type, status: 'processing', progress, message: `Processing (${progress}%)`, result: null, error: null, ...extra }
  }

  const prepareView = (taskId: string, simulationId: string) => {
    const task = need(store.prepareTasks.get(taskId), 'task')
    const done = task.timeline.done
    const current = done ? PROFILE_COUNT : Math.floor(task.timeline.progress * PROFILE_COUNT)
    return {
      simulation_id: simulationId,
      already_prepared: false,
      ...taskView(task.id, 'simulation_prepare', task.timeline, 'sim_prepare', () => ({ simulation_id: simulationId }), {
        progress_detail: { current_item: current, total_items: PROFILE_COUNT },
      }),
    }
  }

  const runView = (simulationId: string) => {
    const sim = need(store.simulations.get(simulationId), 'simulation')
    const run = sim.run
    if (!run) return { simulation_id: simulationId, runner_status: 'idle', current_round: 0, total_rounds: 0, progress_percent: 0, error: null }
    const failed = fails('sim_run')
    const round = run.timeline.done ? run.maxRounds : Math.floor(run.timeline.progress * run.maxRounds)
    const runner = failed ? 'failed' : run.stopped ? 'stopped' : run.timeline.done ? 'completed' : 'running'
    return {
      simulation_id: simulationId,
      runner_status: runner,
      current_round: round,
      total_rounds: run.maxRounds,
      progress_percent: Math.floor((round / run.maxRounds) * 100),
      twitter_running: runner === 'running',
      reddit_running: runner === 'running',
      twitter_actions_count: round * 3,
      reddit_actions_count: round * 2,
      total_actions_count: round * 5,
      error: failed ? FAILURE : null,
    }
  }

  const logLinesAvailable = (timeline: Timeline) =>
    Math.min(agentLogFixture.length, Math.floor(timeline.elapsed / scale(AGENT_LOG_INTERVAL_MS)) + 1)

  const reportView = (reportId: string) => {
    const report = need(store.reports.get(reportId), 'report')
    const base = { report_id: report.id, simulation_id: report.simulationId }
    if (fails('report')) return { ...base, status: 'failed', markdown_content: null, error: FAILURE }
    if (logLinesAvailable(report.timeline) < agentLogFixture.length) {
      return { ...base, status: 'generating', markdown_content: null, error: null }
    }
    return {
      ...base,
      status: 'completed',
      outline: { title: 'Public Reaction to the 20% Price Increase', sections: [] },
      markdown_content: reportMarkdown,
      error: null,
    }
  }

  const routes: Route[] = [
    compile('POST', '/api/graph/ontology/generate', async ({ req }) => {
      const form = await readForm(req)
      const files = form.getAll('files').filter((v) => typeof v !== 'string')
      const requirement = form.get('simulation_requirement')
      if (files.length === 0) throw new HttpError(400, 'at least one file is required')
      if (typeof requirement !== 'string' || !requirement.trim()) throw new HttpError(400, 'simulation_requirement is required')
      await sleep(scale(3000))
      const name = form.get('project_name')
      const project = { id: hexId('proj'), name: typeof name === 'string' && name ? name : 'Mock project' }
      store.projects.set(project.id, project)
      return { ...ontologyFixture, project_id: project.id, project_name: project.name }
    }),
    compile('POST', '/api/graph/build', ({ body }) => {
      const projectId = String(body.project_id ?? '')
      const project = need(store.projects.get(projectId), 'project')
      const task = { id: randomUUID(), projectId, graphId: hexId('mirofish'), timeline: new Timeline(scale(4000)) }
      store.graphTasks.set(task.id, task)
      project.graphId = task.graphId
      return { project_id: projectId, task_id: task.id, message: 'Graph build started' }
    }),
    compile('GET', '/api/graph/task/:id', ({ params }) => {
      const task = need(store.graphTasks.get(params.id as string), 'task')
      return taskView(task.id, 'graph_build', task.timeline, 'graph_build', () => ({
        project_id: task.projectId,
        graph_id: task.graphId,
        node_count: 80,
        edge_count: 124,
        chunk_count: 7,
      }))
    }),
    compile('GET', '/api/graph/data/:id', () => buildGraphData()),
    compile('GET', '/api/graph/project/:id', ({ params }) => {
      const project = need(store.projects.get(params.id as string), 'project')
      return { project_id: project.id, name: project.name, graph_id: project.graphId ?? null }
    }),
    compile('POST', '/api/simulation/create', ({ body }) => {
      const projectId = String(body.project_id ?? '')
      const project = need(store.projects.get(projectId), 'project')
      const graphId = typeof body.graph_id === 'string' && body.graph_id ? body.graph_id : (project.graphId ?? hexId('mirofish'))
      const sim = { id: hexId('sim'), projectId, graphId }
      store.simulations.set(sim.id, sim)
      return { simulation_id: sim.id, project_id: projectId, graph_id: graphId, status: 'created', enable_twitter: true, enable_reddit: true }
    }),
    compile('POST', '/api/simulation/prepare', ({ body }) => {
      const sim = need(store.simulations.get(String(body.simulation_id ?? '')), 'simulation')
      const task = { id: randomUUID(), simulationId: sim.id, timeline: new Timeline(scale(4000)) }
      sim.prepare = task
      store.prepareTasks.set(task.id, task)
      return {
        simulation_id: sim.id,
        task_id: task.id,
        status: 'preparing',
        message: 'Preparation started',
        expected_entities_count: PROFILE_COUNT,
        already_prepared: false,
      }
    }),
    compile('POST', '/api/simulation/prepare/status', ({ body }) => {
      const taskId = typeof body.task_id === 'string' ? body.task_id : undefined
      const simId = typeof body.simulation_id === 'string' ? body.simulation_id : undefined
      const sim = simId ? need(store.simulations.get(simId), 'simulation') : undefined
      const id = taskId ?? sim?.prepare?.id
      const task = need(id ? store.prepareTasks.get(id) : undefined, 'task')
      return prepareView(task.id, task.simulationId)
    }),
    compile('GET', '/api/simulation/:id/profiles/realtime', ({ params }) => {
      const sim = need(store.simulations.get(params.id as string), 'simulation')
      const timeline = need(sim.prepare, 'preparation').timeline
      const count = timeline.done ? PROFILE_COUNT : Math.floor(timeline.progress * PROFILE_COUNT)
      return {
        profiles: Array.from({ length: count }, (_, i) => buildProfile(i)),
        is_generating: !timeline.done,
        total_expected: PROFILE_COUNT,
      }
    }),
    compile('POST', '/api/simulation/start', ({ body }) => {
      const sim = need(store.simulations.get(String(body.simulation_id ?? '')), 'simulation')
      const requested = Number(body.max_rounds)
      const maxRounds = Number.isInteger(requested) && requested > 0 ? requested : DEFAULT_MAX_ROUNDS
      sim.run = { maxRounds, timeline: new Timeline(scale(maxRounds * 1000)), stopped: false }
      return {
        simulation_id: sim.id,
        runner_status: 'starting',
        twitter_running: true,
        reddit_running: true,
        total_rounds: maxRounds,
        max_rounds_applied: maxRounds,
      }
    }),
    compile('GET', '/api/simulation/:id/run-status', ({ params }) => runView(params.id as string)),
    compile('GET', '/api/simulation/:id/posts', ({ params, query }) => {
      const sim = need(store.simulations.get(params.id as string), 'simulation')
      const platform = query.get('platform')
      if (platform !== 'twitter' && platform !== 'reddit') throw new HttpError(400, 'platform must be twitter or reddit')
      const round = sim.run ? (runView(sim.id).current_round as number) : 0
      const all = Array.from({ length: round }, (_, r) => [0, 1].map((k) => buildPost(platform, r + 1, k))).flat()
      const offset = Math.max(0, Number(query.get('offset')) || 0)
      const limit = Number(query.get('limit')) || all.length
      return { platform, total: all.length, count: Math.min(limit, Math.max(0, all.length - offset)), posts: all.slice(offset, offset + limit) }
    }),
    compile('POST', '/api/simulation/stop', ({ body }) => {
      const sim = need(store.simulations.get(String(body.simulation_id ?? '')), 'simulation')
      if (sim.run) sim.run.stopped = true
      return { simulation_id: sim.id, stopped: true }
    }),
    compile('POST', '/api/simulation/close-env', ({ body }) => {
      need(store.simulations.get(String(body.simulation_id ?? '')), 'simulation')
      return { closed: true }
    }),
    compile('POST', '/api/simulation/interview/batch', ({ body }) => {
      need(store.simulations.get(String(body.simulation_id ?? '')), 'simulation')
      const interviews = Array.isArray(body.interviews) ? (body.interviews as Array<{ agent_id?: unknown }>) : []
      return { results: interviews.map((i) => ({ agent_id: i.agent_id, response: 'Mock interview response.' })) }
    }),
    compile('POST', '/api/report/generate', ({ body }) => {
      const sim = need(store.simulations.get(String(body.simulation_id ?? '')), 'simulation')
      const report = {
        id: hexId('report'),
        simulationId: sim.id,
        timeline: new Timeline(scale(AGENT_LOG_INTERVAL_MS) * agentLogFixture.length),
      }
      store.reports.set(report.id, report)
      return {
        simulation_id: sim.id,
        report_id: report.id,
        task_id: randomUUID(),
        status: 'generating',
        message: 'Report generation started',
        already_generated: false,
      }
    }),
    compile('GET', '/api/report/:id/agent-log', ({ params, query }) => {
      const report = need(store.reports.get(params.id as string), 'report')
      const available = logLinesAvailable(report.timeline)
      const from = Math.max(0, Number(query.get('from_line')) || 0)
      const logs = agentLogFixture.slice(from, available).map((line) => ({ ...line, report_id: report.id }))
      return { logs, total_lines: available, from_line: from, has_more: false }
    }),
    compile('GET', '/api/report/:id', ({ params }) => reportView(params.id as string)),
    compile('POST', '/api/report/chat', ({ body }) => {
      need(store.simulations.get(String(body.simulation_id ?? '')), 'simulation')
      return { response: 'Mock report agent reply.', tool_calls: [], sources: [] }
    }),
  ]

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://mock.local')
      const method = req.method ?? 'GET'
      let matched: { route: Route; params: Record<string, string> } | undefined
      for (const route of routes) {
        if (route.method !== method) continue
        const m = route.regex.exec(url.pathname)
        if (m) {
          matched = { route, params: Object.fromEntries(route.names.map((n, i) => [n, decodeURIComponent(m[i + 1] as string)])) }
          break
        }
      }
      if (!matched) throw new HttpError(404, `no route for ${method} ${url.pathname}`)
      if (process.env.MOCK_LOG === '1') console.log(`${method} ${url.pathname}`)
      const key = `${method} ${matched.route.pattern}`
      calls[key] = (calls[key] ?? 0) + 1
      if (opts.token && req.headers['x-mirofish-token'] !== opts.token) throw new HttpError(401, 'unauthorized')
      const isForm = matched.route.pattern === '/api/graph/ontology/generate'
      const body = method === 'POST' && !isForm ? await readBody(req) : {}
      const data = await matched.route.handler({ params: matched.params, query: url.searchParams, body, req })
      send(res, 200, { success: true, data })
    } catch (err) {
      if (err instanceof HttpError) send(res, err.status, { success: false, error: err.message })
      else send(res, 500, { success: false, error: err instanceof Error ? err.message : 'internal error' })
    }
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(opts.port ?? 0, '127.0.0.1', resolve)
  })
  const { port } = server.address() as AddressInfo

  return {
    url: `http://127.0.0.1:${port}`,
    calls,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()))
        server.closeAllConnections()
      }),
  }
}

const STAGES: FailStage[] = ['graph_build', 'sim_prepare', 'sim_run', 'report']

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const failStage = process.env.MOCK_FAIL_STAGE as FailStage | undefined
  if (failStage && !STAGES.includes(failStage)) throw new Error(`MOCK_FAIL_STAGE must be one of ${STAGES.join(', ')}`)
  const mock = await startMockMiroFish({
    port: Number(process.env.PORT ?? 5001),
    speed: Number(process.env.MOCK_SPEED ?? 1),
    failStage: failStage || undefined,
    token: process.env.MOCK_TOKEN || undefined,
  })
  console.log(`Mock MiroFish listening on ${mock.url}`)
}
