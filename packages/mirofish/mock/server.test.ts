import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MiroFishError, createMiroFishClient } from '../src/index'
import { startMockMiroFish } from './server'

type Mock = Awaited<ReturnType<typeof startMockMiroFish>>

const poll = async <T>(fn: () => Promise<T>, done: (v: T) => boolean) => {
  const deadline = Date.now() + 5000
  for (;;) {
    const value = await fn()
    if (done(value)) return value
    if (Date.now() > deadline) throw new Error('poll timed out')
    await new Promise((r) => setTimeout(r, 10))
  }
}

const files = [{ name: 'memo.md', bytes: new TextEncoder().encode('# Pricing memo'), type: 'text/markdown' }]

describe('mock MiroFish pipeline', () => {
  let mock: Mock
  let client: ReturnType<typeof createMiroFishClient>
  const ids: Record<string, string> = {}

  beforeAll(async () => {
    mock = await startMockMiroFish({ port: 0, speed: 100 })
    client = createMiroFishClient({ baseUrl: mock.url })
  })
  afterAll(() => mock.close())

  it('generates an ontology', async () => {
    const out = await client.graph.generateOntology({ files, requirement: 'How will customers react?' })
    expect(out.project_id).toMatch(/^proj_[0-9a-f]{12}$/)
    ids.project = out.project_id
  })

  it('builds the graph', async () => {
    const started = await client.graph.build({ projectId: ids.project! })
    const task = await poll(
      () => client.graph.getTask(started.task_id!),
      (t) => t.status === 'completed',
    )
    const graphId = (task.result as { graph_id: string }).graph_id
    ids.graph = graphId
    const data = await client.graph.getData(graphId)
    expect(data.nodes).toHaveLength(80)
    expect(data.edges).toHaveLength(124)
  })

  it('creates and prepares a simulation', async () => {
    const sim = await client.simulation.create({ projectId: ids.project!, graphId: ids.graph })
    expect(sim.simulation_id).toMatch(/^sim_[0-9a-f]{12}$/)
    ids.sim = sim.simulation_id
    const started = await client.simulation.prepare({ simulationId: ids.sim })
    const status = await poll(
      () => client.simulation.prepareStatus({ taskId: started.task_id }),
      (t) => t.status === 'completed',
    )
    expect(status.progress).toBe(100)
    const profiles = await client.simulation.profilesRealtime(ids.sim)
    expect(profiles.profiles).toHaveLength(12)
    expect(profiles.is_generating).toBe(false)
  })

  it('runs the simulation', async () => {
    await client.simulation.start({ simulationId: ids.sim!, maxRounds: 5 })
    const status = await poll(
      () => client.simulation.runStatus(ids.sim!),
      (s) => s.runner_status === 'completed',
    )
    expect(status.current_round).toBe(5)
    const posts = (await client.simulation.posts(ids.sim!, { platform: 'twitter' })) as { posts: unknown[] }
    expect(posts.posts).toHaveLength(10)
    expect(mock.calls['POST /api/simulation/start']).toBe(1)
    expect(mock.calls['GET /api/simulation/:id/run-status']).toBeGreaterThan(0)
  })

  it('generates the report', async () => {
    const started = await client.report.generate({ simulationId: ids.sim! })
    let from = 0
    let last = ''
    await poll(
      async () => {
        const page = await client.report.agentLog(started.report_id, from)
        from += page.logs.length
        last = page.logs.at(-1)?.action ?? last
        return last
      },
      (action) => action === 'report_complete',
    )
    const report = await client.report.get(started.report_id)
    expect(report.status).toBe('completed')
    expect(report.markdown_content).toContain('## Conclusion')
  })

  it('rejects missing files on ontology', async () => {
    const err = await client.graph.generateOntology({ files: [], requirement: 'x' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(MiroFishError)
    expect((err as MiroFishError).status).toBe(400)
  })
})

describe('mock MiroFish options', () => {
  it('requires token when token is set', async () => {
    const mock = await startMockMiroFish({ port: 0, speed: 100, token: 'secret' })
    try {
      const bad = await createMiroFishClient({ baseUrl: mock.url }).graph.getData('g').catch((e: unknown) => e)
      expect((bad as MiroFishError).status).toBe(401)
      const ok = await createMiroFishClient({ baseUrl: mock.url, token: 'secret' }).graph.getData('g')
      expect(ok.nodes).toHaveLength(80)
    } finally {
      await mock.close()
    }
  })

  it('reports a failed graph task when failStage is graph_build', async () => {
    const mock = await startMockMiroFish({ port: 0, speed: 100, failStage: 'graph_build' })
    try {
      const client = createMiroFishClient({ baseUrl: mock.url })
      const { project_id } = await client.graph.generateOntology({ files, requirement: 'x' })
      const started = await client.graph.build({ projectId: project_id })
      const task = await client.graph.getTask(started.task_id!)
      expect(task.status).toBe('failed')
      expect(task.error).toBe('Injected failure')
    } finally {
      await mock.close()
    }
  })
})
