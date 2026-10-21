import type { Run } from '@xo/db'
import { type Deps, cancelRun, createMemoryStore } from '@xo/engine'
import type { MiroFishClient } from '@xo/mirofish'
import { describe, expect, it, vi } from 'vitest'
import { runWorkerLoop } from './loop'

type Overrides = { [K in keyof MiroFishClient]?: Partial<MiroFishClient[K]> }

const NOW = new Date('2026-10-20T12:00:00Z')
const LOGS = [
  { action: 'report_start' },
  { action: 'planning_complete', details: { outline: { title: 'T', sections: [{ title: 'A' }, { title: 'B' }] } } },
  { action: 'section_start', section_index: 1, section_title: 'A' },
  { action: 'tool_call', section_index: 1, section_title: 'A', details: { tool_name: 'quick_search' } },
  { action: 'section_complete', section_index: 1, section_title: 'A' },
  { action: 'report_complete' },
]

const post = (platform: 'twitter' | 'reddit', round: number) => ({
  post_id: `${platform}_${round}`,
  agent_name: 'Maya',
  content: `${platform} r${round}`,
  round,
  platform,
})

const fakeClient = (o: Overrides = {}): MiroFishClient =>
  ({
    graph: {
      generateOntology: vi.fn(async () => ({
        project_id: 'proj_1',
        ontology: { entity_types: [{ name: 'Customer' }], edge_types: [{ name: 'BUYS' }] },
      })),
      build: vi.fn(async () => ({ project_id: 'proj_1', task_id: 'gtask_1' })),
      getTask: vi
        .fn()
        .mockResolvedValueOnce({ task_id: 'gtask_1', status: 'processing', progress: 40, message: 'Extracting' })
        .mockResolvedValue({ task_id: 'gtask_1', status: 'completed', progress: 100, result: { graph_id: 'graph_1' } }),
      getData: vi.fn(async () => ({
        nodes: [
          { uuid: 'n1', name: 'Maya', labels: ['Customer'] },
          { uuid: 'n2', name: 'Acme', labels: ['Competitor'] },
        ],
        edges: [{ uuid: 'e1', source_node_uuid: 'n1', target_node_uuid: 'n2', name: 'BUYS' }],
      })),
      getProject: vi.fn(),
      ...o.graph,
    },
    simulation: {
      create: vi.fn(async () => ({ simulation_id: 'sim_1' })),
      prepare: vi.fn(async () => ({ simulation_id: 'sim_1', task_id: 'ptask_1' })),
      prepareStatus: vi
        .fn()
        .mockResolvedValueOnce({ task_id: 'ptask_1', status: 'processing', progress: 50, progress_detail: { current_stage_name: 'Profiles' } })
        .mockResolvedValue({ task_id: 'ptask_1', status: 'completed', progress: 100 }),
      profilesRealtime: vi
        .fn()
        .mockResolvedValueOnce({ profiles: [{ agent_id: 0, name: 'Maya' }], total_expected: 2 })
        .mockResolvedValue({ profiles: [{ agent_id: 0, name: 'Maya' }, { agent_id: 1, name: 'Liam' }], total_expected: 2 }),
      start: vi.fn(async () => ({ runner_status: 'starting' })),
      runStatus: vi
        .fn()
        .mockResolvedValueOnce({ runner_status: 'running', current_round: 1, total_rounds: 2, progress_percent: 50 })
        .mockResolvedValue({ runner_status: 'completed', current_round: 2, total_rounds: 2, progress_percent: 100 }),
      posts: vi.fn(async (_id: string, q: { platform: 'twitter' | 'reddit'; offset?: number }) =>
        q.offset ? { posts: [post(q.platform, 2)] } : { posts: [post(q.platform, 1)] },
      ),
      stop: vi.fn(),
      closeEnv: vi.fn(),
      interviewBatch: vi.fn(),
      ...o.simulation,
    },
    report: {
      generate: vi.fn(async () => ({ simulation_id: 'sim_1', report_id: 'rep_1', task_id: 'rtask_1' })),
      agentLog: vi
        .fn()
        .mockResolvedValueOnce({ logs: LOGS.slice(0, 3), total_lines: 3, from_line: 0, has_more: false })
        .mockResolvedValueOnce({ logs: LOGS.slice(3), total_lines: 6, from_line: 3, has_more: false })
        .mockResolvedValue({ logs: [], total_lines: 6, from_line: 6, has_more: false }),
      get: vi
        .fn()
        .mockResolvedValueOnce({ report_id: 'rep_1', simulation_id: 'sim_1', status: 'generating' })
        .mockResolvedValue({ report_id: 'rep_1', simulation_id: 'sim_1', status: 'completed', markdown_content: '# Report' }),
      chat: vi.fn(),
      ...o.report,
    },
  }) as unknown as MiroFishClient

const STAGES = ['ontology', 'graph', 'sim_prepare', 'sim_run', 'report', 'finished']

const setup = async (o: Overrides = {}) => {
  const store = createMemoryStore()
  store.uploads.set('up_1', {
    id: 'up_1',
    userId: 'u1',
    chatId: 'c1',
    storageKey: 'k/brief.md',
    filename: 'brief.md',
    mediaType: 'text/markdown',
    sizeBytes: 12,
    createdAt: NOW,
  })
  const created = await store.create({ chatId: 'c1', userId: 'u1', assistantMessageId: 'm1', config: { requirement: 'React?', maxRounds: 2, uploadIds: ['up_1'] } })
  const stages: string[] = []
  const update = store.update.bind(store)
  store.update = vi.fn(async (id, patch) => {
    if (patch.stage) stages.push(patch.stage)
    return update(id, patch)
  })
  store.renewLease = vi.fn(store.renewLease.bind(store))
  store.setMessageParts = vi.fn(store.setMessageParts.bind(store))
  const deps: Deps = {
    store,
    mirofish: fakeClient(o),
    storage: { get: vi.fn(async () => new Uint8Array([1])), put: vi.fn(), delete: vi.fn() },
    now: () => NOW,
    sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, Math.min(ms, 2))),
    log: vi.fn(),
  }
  return { store, deps, runId: created.id, stages }
}

const loopOpts = { owner: 'w1', leaseMs: 60_000, pollMs: 10, maxConcurrent: 1 }

const runUntilTerminal = async (store: ReturnType<typeof createMemoryStore>, runId: string, deps: Deps) => {
  const ac = new AbortController()
  const loop = runWorkerLoop({ ...deps, ...loopOpts, signal: ac.signal })
  const deadline = Date.now() + 5000
  let run = (await store.get(runId)) as Run
  while (!['done', 'failed', 'cancelled'].includes(run.status) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2))
    run = (await store.get(runId)) as Run
  }
  ac.abort()
  await loop
  return run
}

describe('runWorkerLoop', () => {
  it('claims a queued run and ticks it to done, materialising on each stage change', async () => {
    const { store, deps, runId, stages } = await setup()
    const run = await runUntilTerminal(store, runId, deps)
    expect(run.status).toBe('done')
    const transitions = new Set(stages)
    expect(transitions.size).toBe(STAGES.length)
    expect(vi.mocked(store.setMessageParts).mock.calls.length).toBeGreaterThanOrEqual(transitions.size + 1)
  })

  it('renews the lease before every tick', async () => {
    const { store, deps, runId } = await setup()
    const tickSpy = vi.mocked(deps.mirofish.graph.getTask)
    await runUntilTerminal(store, runId, deps)
    expect(vi.mocked(store.renewLease).mock.calls.length).toBeGreaterThanOrEqual(tickSpy.mock.calls.length + 1)
    expect(vi.mocked(store.renewLease).mock.calls[0]).toEqual([runId, 'w1', 60_000])
  })

  it('fails a run with code internal when a stage throws an unexpected error', async () => {
    const { store, deps, runId } = await setup({ graph: { getTask: vi.fn(async () => { throw new Error('boom') }) } as never })
    const run = await runUntilTerminal(store, runId, deps)
    expect(run.status).toBe('failed')
    expect(run.error?.code).toBe('internal')
    expect(vi.mocked(store.setMessageParts)).toHaveBeenCalled()
  })

  it('does not tick a run again after it is terminal', async () => {
    const { store, deps, runId } = await setup()
    await runUntilTerminal(store, runId, deps)
    const calls = vi.mocked(store.update).mock.calls.length
    await new Promise((r) => setTimeout(r, 30))
    expect(vi.mocked(store.update).mock.calls.length).toBe(calls)
  })

  it('exits promptly on abort while idle even if sleep never resolves', async () => {
    const { deps } = await setup()
    deps.store.claimNext = vi.fn(async () => null)
    deps.sleep = () => new Promise(() => {})
    const ac = new AbortController()
    const loop = runWorkerLoop({ ...deps, ...loopOpts, signal: ac.signal })
    setTimeout(() => ac.abort(), 20)
    await expect(loop).resolves.toBeUndefined()
  })

  it('exits promptly on abort mid-run', async () => {
    const { deps } = await setup({ graph: { getTask: vi.fn(async () => ({ task_id: 'gtask_1', status: 'processing', progress: 10 })) } as never })
    deps.sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const ac = new AbortController()
    const loop = runWorkerLoop({ ...deps, ...loopOpts, pollMs: 50, signal: ac.signal })
    await new Promise((r) => setTimeout(r, 80))
    const started = Date.now()
    ac.abort()
    await loop
    expect(Date.now() - started).toBeLessThan(100)
  })

  it('stops the simulation and never fails the run when it is cancelled mid-run', async () => {
    const running = { runner_status: 'running', current_round: 1, total_rounds: 5, progress_percent: 20 }
    const { store, deps, runId } = await setup({ simulation: { runStatus: vi.fn(async () => running) } as never })
    await store.update(runId, { stage: 'sim_run', ids: { simulationId: 's1' }, cursors: { simStarted: true, startAcked: true } })
    const ac = new AbortController()
    const loop = runWorkerLoop({ ...deps, ...loopOpts, signal: ac.signal })
    await vi.waitFor(() => expect(vi.mocked(deps.mirofish.simulation.runStatus)).toHaveBeenCalled())
    await cancelRun(store, runId, new Date())
    await vi.waitFor(() => expect(vi.mocked(deps.mirofish.simulation.stop)).toHaveBeenCalledTimes(1))
    await new Promise((r) => setTimeout(r, 50))
    ac.abort()
    await loop
    expect(vi.mocked(deps.mirofish.simulation.stop)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(deps.mirofish.simulation.stop)).toHaveBeenCalledWith('s1')
    expect(vi.mocked(deps.mirofish.simulation.closeEnv)).toHaveBeenCalledWith('s1')
    const run = (await store.get(runId)) as Run
    expect(run.status).toBe('cancelled')
    const events = await store.listEvents(runId, 0)
    expect(events.at(-1)?.kind).toBe('cancelled')
    expect(events.some((e) => e.kind === 'error')).toBe(false)
    expect(store.parts.get('m1')).toContainEqual(expect.objectContaining({ type: 'data-stage', data: expect.objectContaining({ stage: 'sim_run', status: 'cancelled' }) }))
  })

  it('stops the simulation once and stops driving when the run is deleted mid-run', async () => {
    const running = { runner_status: 'running', current_round: 1, total_rounds: 5, progress_percent: 20 }
    const { store, deps, runId } = await setup({ simulation: { runStatus: vi.fn(async () => running) } as never })
    await store.update(runId, { stage: 'sim_run', ids: { simulationId: 's1' }, cursors: { simStarted: true, startAcked: true } })
    const ac = new AbortController()
    const loop = runWorkerLoop({ ...deps, ...loopOpts, signal: ac.signal })
    await vi.waitFor(() => expect(vi.mocked(deps.mirofish.simulation.runStatus)).toHaveBeenCalled())
    store.runs.delete(runId)
    await vi.waitFor(() => expect(vi.mocked(deps.mirofish.simulation.stop)).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(vi.mocked(deps.log)).toHaveBeenCalledWith('run deleted', { runId, owner: 'w1' }))
    const polls = vi.mocked(deps.mirofish.simulation.runStatus).mock.calls.length
    await new Promise((r) => setTimeout(r, 50))
    expect(vi.mocked(deps.mirofish.simulation.runStatus).mock.calls.length).toBe(polls)
    ac.abort()
    await loop
    expect(vi.mocked(deps.mirofish.simulation.stop)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(deps.mirofish.simulation.stop)).toHaveBeenCalledWith('s1')
    expect(vi.mocked(deps.mirofish.simulation.closeEnv)).toHaveBeenCalledWith('s1')
    expect((store.events.get(runId) ?? []).some((e) => e.kind === 'error')).toBe(false)
  })

  it('renews the lease on a heartbeat while a tick is in flight', async () => {
    let settled = false
    const getTask = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 1000))
      settled = true
      return { task_id: 'gtask_1', status: 'processing', progress: 10 }
    })
    const { store, deps, runId } = await setup({ graph: { getTask } as never })
    await store.update(runId, { stage: 'graph_build', ids: { graphTaskId: 'gtask_1' } })
    const ac = new AbortController()
    const loop = runWorkerLoop({ ...deps, ...loopOpts, leaseMs: 300, signal: ac.signal })
    await vi.waitFor(() => expect(getTask).toHaveBeenCalled())
    await vi.waitFor(() => expect(settled).toBe(true), { timeout: 3000 })
    expect(vi.mocked(store.renewLease).mock.calls.length).toBeGreaterThanOrEqual(3)
    ac.abort()
    await loop
  })

  it('releases the lease once on abort with a run in flight', async () => {
    const { store, deps, runId } = await setup({ graph: { getTask: vi.fn(async () => ({ task_id: 'gtask_1', status: 'processing', progress: 10 })) } as never })
    store.releaseLease = vi.fn(store.releaseLease.bind(store))
    const ac = new AbortController()
    const loop = runWorkerLoop({ ...deps, ...loopOpts, signal: ac.signal })
    await vi.waitFor(() => expect(vi.mocked(deps.mirofish.graph.getTask)).toHaveBeenCalled())
    ac.abort()
    await loop
    expect(vi.mocked(store.releaseLease).mock.calls).toEqual([[runId, 'w1']])
  })
})
