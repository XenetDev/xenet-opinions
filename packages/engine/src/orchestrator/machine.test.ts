import { MiroFishError } from '@xo/mirofish'
import { StorageError } from '@xo/storage'
import { describe, expect, it, vi } from 'vitest'
import type { StageData } from '../parts'
import { tick } from './machine'
import { LOGS, NOW, drive, setupRun as setup } from './test-helpers'

const label = (e: { kind: string; payload: unknown }) => {
  if (e.kind === 'stage') {
    const p = e.payload as StageData
    return `stage:${p.stage}:${p.status}`
  }
  if (e.kind === 'report_event') return `report_event:${(e.payload as { n: number }).n}`
  return e.kind
}

const ids = { projectId: 'proj_1', graphId: 'graph_1', simulationId: 'sim_1' }

describe('tick', () => {
  it('drives a run through every stage to done', async () => {
    const { store, deps, run } = await setup()
    const done = await drive(run, deps)
    expect(done.status).toBe('done')
    expect(done.envState).toBe('open')
    expect(done.finishedAt).toEqual(NOW)
    expect(done.ids).toEqual({
      projectId: 'proj_1',
      graphTaskId: 'gtask_1',
      graphId: 'graph_1',
      simulationId: 'sim_1',
      prepareTaskId: 'ptask_1',
      reportId: 'rep_1',
      reportTaskId: 'rtask_1',
    })
    expect(done.cursors.retries ?? 0).toBe(0)
    const events = store.events.get(run.id) ?? []
    expect(events.map(label)).toEqual([
      'stage:ontology:running',
      'sources',
      'ontology',
      'stage:ontology:done',
      'stage:graph_build:running',
      'stage:graph_build:running',
      'graph',
      'stage:graph_build:done',
      'stage:sim_create:running',
      'stage:sim_create:done',
      'stage:sim_prepare:running',
      'stage:sim_prepare:running',
      'agents',
      'agents',
      'stage:sim_prepare:done',
      'stage:sim_run:running',
      'sim_feed',
      'stage:sim_run:running',
      'sim_feed',
      'stage:sim_run:done',
      'stage:report:running',
      'report_outline',
      'report_event:0',
      'report_event:1',
      'report_outline',
      'report_event:2',
      'report_event:3',
      'report_event:4',
      'report_text',
      'stage:report:done',
      'stage:finished:done',
      'done',
    ])
    const payloadOf = (kind: string) => events.filter((e) => e.kind === kind).map((e) => e.payload)
    expect(payloadOf('sources')).toEqual([{ files: [{ id: 'up_1', filename: 'brief.md', mediaType: 'text/markdown', sizeBytes: 12 }] }])
    expect(payloadOf('report_text')).toEqual([{ markdown: '# Report' }])
    expect(payloadOf('sim_feed').at(-1)).toMatchObject({ round: 2, totalRounds: 2, twitterActs: 2, redditActs: 2 })
    expect(events.find((e) => e.kind === 'stage' && (e.payload as StageData).message === 'Round 1/2')).toBeDefined()
    expect(deps.storage.get).toHaveBeenCalledWith('k/brief.md')
    const mf = deps.mirofish
    expect(mf.graph.generateOntology).toHaveBeenCalledWith({
      files: [{ name: 'brief.md', bytes: new Uint8Array([1]), type: 'text/markdown' }],
      requirement: 'React?',
    })
    expect(mf.simulation.start).toHaveBeenCalledWith({ simulationId: 'sim_1', maxRounds: 2 })
    for (const c of vi.mocked(mf.simulation.posts).mock.calls) expect(c[1]).toMatchObject({ platform: expect.any(String), limit: 50 })
    expect(vi.mocked(mf.simulation.posts).mock.calls.map((c) => [c[1].platform, c[1].offset])).toEqual([
      ['twitter', 0],
      ['reddit', 0],
      ['twitter', 1],
      ['reddit', 1],
    ])
    expect(vi.mocked(mf.report.agentLog).mock.calls.map((c) => c[1])).toEqual([0, 3, 6])
    for (const fn of [mf.graph.generateOntology, mf.graph.build, mf.simulation.create, mf.simulation.prepare, mf.simulation.start, mf.report.generate]) {
      expect(fn).toHaveBeenCalledTimes(1)
    }
  })

  it('sends a sanitised filename with an extension to MiroFish', async () => {
    const { store, deps, run } = await setup()
    store.uploads.set('up_1', { ...store.uploads.get('up_1')!, filename: 'my brief (v2)' })
    await tick(run, deps)
    expect(deps.mirofish.graph.generateOntology).toHaveBeenCalledWith({
      files: [{ name: 'my_brief__v2_.md', bytes: new Uint8Array([1]), type: 'text/markdown' }],
      requirement: 'React?',
    })
    const sources = (store.events.get(run.id) ?? []).find((e) => e.kind === 'sources')
    expect(sources?.payload).toMatchObject({ files: [{ filename: 'my brief (v2)' }] })
  })

  it('drains the agent log once more after report completion before emitting the text', async () => {
    const { store, deps, run } = await setup(
      {
        report: {
          agentLog: vi
            .fn()
            .mockResolvedValueOnce({ logs: LOGS.slice(0, 5), total_lines: 5, from_line: 0, has_more: false })
            .mockResolvedValueOnce({ logs: LOGS.slice(5), total_lines: 6, from_line: 5, has_more: false })
            .mockResolvedValue({ logs: [], total_lines: 6, from_line: 6, has_more: false }),
          get: vi.fn(async () => ({ report_id: 'rep_1', simulation_id: 'sim_1', status: 'completed' as const, markdown_content: 'md' })),
        },
      },
      { stage: 'report', ids: { ...ids, reportId: 'rep_1' } },
    )
    const next = await tick(run, deps)
    expect(next.stage).toBe('finished')
    const labels = (store.events.get(run.id) ?? []).map(label)
    expect(labels.slice(-3)).toEqual(['report_event:4', 'report_text', 'stage:report:done'])
    expect(next.cursors.agentLogLine).toBe(6)
  })

  it('sim_run.enter persists simStarted before appending any event', async () => {
    const { store, deps, run } = await setup({}, { stage: 'sim_run', ids })
    const update = vi.spyOn(store, 'update')
    const append = vi.spyOn(store, 'appendEvent')
    const next = await tick(run, deps)
    expect(next.cursors.simStarted).toBe(true)
    const markIdx = update.mock.calls.findIndex((c) => c[1].cursors?.simStarted === true)
    expect(markIdx).toBeGreaterThanOrEqual(0)
    const markOrder = update.mock.invocationCallOrder[markIdx] as number
    expect(append.mock.invocationCallOrder.length).toBeGreaterThan(0)
    expect(Math.min(...append.mock.invocationCallOrder)).toBeGreaterThan(markOrder)
    expect(deps.mirofish.simulation.start).toHaveBeenCalledTimes(1)
  })

  it('persists the start intent before calling start', async () => {
    const { store, deps, run } = await setup({}, { stage: 'sim_run', ids })
    const update = vi.spyOn(store, 'update')
    await tick(run, deps)
    const markIdx = update.mock.calls.findIndex((c) => c[1].cursors?.simStarted === true)
    const startOrder = vi.mocked(deps.mirofish.simulation.start).mock.invocationCallOrder[0] as number
    expect(update.mock.invocationCallOrder[markIdx]).toBeLessThan(startOrder)
  })

  it('a transient start failure is not retried by enter; the next tick polls status', async () => {
    const err = new MiroFishError({ code: 'timeout', message: 'timed out', path: '/api/simulation/start' })
    const { deps, run } = await setup({ simulation: { start: vi.fn(async () => Promise.reject(err)) } }, { stage: 'sim_run', ids })
    const after = await tick(run, deps)
    expect(after.status).toBe('running')
    expect(after.cursors.simStarted).toBe(true)
    expect(deps.sleep).not.toHaveBeenCalled()
    await tick(after, deps)
    expect(deps.mirofish.simulation.start).toHaveBeenCalledTimes(1)
    expect(deps.mirofish.simulation.runStatus).toHaveBeenCalledTimes(1)
  })

  it('a non-retriable start failure fails the run', async () => {
    const err = new MiroFishError({ code: 'api', message: 'no such simulation', path: '/api/simulation/start' })
    const { deps, run } = await setup({ simulation: { start: vi.fn(async () => Promise.reject(err)) } }, { stage: 'sim_run', ids })
    const after = await tick(run, deps)
    expect(after.status).toBe('failed')
    expect(after.error).toEqual({ stage: 'sim_run', code: 'api', message: 'no such simulation' })
  })

  it('two consecutive idle polls after an unacknowledged start clear simStarted and re-enter', async () => {
    const idle = { runner_status: 'idle' as const }
    const err = new MiroFishError({ code: 'timeout', message: 'timed out', path: '/api/simulation/start' })
    const { deps, run } = await setup(
      {
        simulation: {
          start: vi.fn().mockRejectedValueOnce(err).mockResolvedValue({ runner_status: 'starting' }),
          runStatus: vi.fn().mockResolvedValueOnce(idle).mockResolvedValueOnce(idle).mockResolvedValue({ runner_status: 'running', current_round: 0 }),
        },
      },
      { stage: 'sim_run', ids },
    )
    const entered = await tick(run, deps)
    expect(entered.cursors.simStarted).toBe(true)
    expect(entered.cursors.startAcked).toBeUndefined()
    const once = await tick(entered, deps)
    expect(once.cursors.simStarted).toBe(true)
    expect(once.cursors.idlePolls).toBe(1)
    const cleared = await tick(once, deps)
    expect(cleared.status).toBe('running')
    expect(cleared.cursors.simStarted).toBe(false)
    expect(cleared.cursors.idlePolls).toBe(0)
    expect(deps.mirofish.simulation.start).toHaveBeenCalledTimes(1)
    const restarted = await tick(cleared, deps)
    expect(deps.mirofish.simulation.start).toHaveBeenCalledTimes(2)
    expect(restarted.cursors).toMatchObject({ simStarted: true, startAcked: true })
  })

  it('two consecutive idle polls after an acknowledged start fail the run without restarting', async () => {
    const { store, deps, run } = await setup(
      { simulation: { runStatus: vi.fn(async () => ({ runner_status: 'idle' as const })) } },
      { stage: 'sim_run', ids },
    )
    const entered = await tick(run, deps)
    expect(entered.cursors).toMatchObject({ simStarted: true, startAcked: true })
    const next = await drive(entered, deps)
    expect(next.status).toBe('failed')
    expect(next.error).toEqual({ stage: 'sim_run', code: 'api', message: 'simulation backend reported idle after start' })
    expect(deps.mirofish.simulation.start).toHaveBeenCalledTimes(1)
    expect(deps.mirofish.simulation.runStatus).toHaveBeenCalledTimes(2)
    expect((store.events.get(run.id) ?? []).map(label).slice(-2)).toEqual(['stage:sim_run:failed', 'error'])
  })

  it('a single idle poll followed by starting does not re-call start', async () => {
    const { deps, run } = await setup(
      {
        simulation: {
          runStatus: vi
            .fn()
            .mockResolvedValueOnce({ runner_status: 'idle' })
            .mockResolvedValueOnce({ runner_status: 'starting' })
            .mockResolvedValue({ runner_status: 'idle' }),
        },
      },
      { stage: 'sim_run', ids, cursors: { simStarted: true } },
    )
    let current = run
    for (let i = 0; i < 3; i++) current = await tick(current, deps)
    expect(deps.mirofish.simulation.start).not.toHaveBeenCalled()
    expect(current.cursors.simStarted).toBe(true)
    expect(current.cursors.idlePolls).toBe(1)
  })

  it('a runner that stays idle without an acknowledged start fails the run after three restarts', async () => {
    const err = new MiroFishError({ code: 'network', message: 'ECONNRESET', path: '/api/simulation/start' })
    const { store, deps, run } = await setup(
      { simulation: { start: vi.fn(async () => Promise.reject(err)), runStatus: vi.fn(async () => ({ runner_status: 'idle' as const })) } },
      { stage: 'sim_run', ids, cursors: { simStarted: true } },
    )
    const next = await drive(run, deps)
    expect(next.status).toBe('failed')
    expect(next.error).toEqual({ stage: 'sim_run', code: 'internal', message: 'simulation never started' })
    expect(deps.mirofish.simulation.runStatus).toHaveBeenCalledTimes(8)
    expect(deps.mirofish.simulation.start).toHaveBeenCalledTimes(3)
    expect((store.events.get(run.id) ?? []).map(label).slice(-2)).toEqual(['stage:sim_run:failed', 'error'])
  })

  it('fetches the posts backlog on completion and keeps the newest 50', async () => {
    const page = (platform: 'twitter' | 'reddit', offset: number, n: number) =>
      Array.from({ length: n }, (_, i) => ({ post_id: `${platform}_${offset + i}`, agent_name: 'a', content: 'c', round: Math.floor((offset + i) / 10) + 1, platform }))
    const { store, deps, run } = await setup(
      {
        simulation: {
          runStatus: vi.fn(async () => ({ runner_status: 'completed' as const, current_round: 6, total_rounds: 6 })),
          posts: vi.fn(async (_id: string, q: { platform: 'twitter' | 'reddit'; offset?: number }) => ({
            posts: q.offset ? page(q.platform, q.offset, 10) : page(q.platform, 0, 50),
          })),
        },
      },
      { stage: 'sim_run', ids, cursors: { simStarted: true } },
    )
    const next = await tick(run, deps)
    expect(next.stage).toBe('report')
    expect(next.cursors.postsOffsetTwitter).toBe(60)
    expect(next.cursors.postsOffsetReddit).toBe(60)
    expect(deps.mirofish.simulation.posts).toHaveBeenCalledTimes(4)
    const feed = (store.events.get(run.id) ?? []).find((e) => e.kind === 'sim_feed')?.payload as { posts: Array<{ round: number }> }
    expect(feed.posts).toHaveLength(50)
    expect(feed.posts.every((p) => p.round >= 2)).toBe(true)
    expect(feed.posts.at(-1)?.round).toBe(6)
  })

  it('does not emit the report text until a drain after completion reaches an empty page', async () => {
    const line = { action: 'tool_call', details: { tool_name: 'quick_search' } }
    const { store, deps, run } = await setup(
      {
        report: {
          agentLog: vi.fn(async (_id: string, from: number) => ({ logs: [line], total_lines: from + 1, from_line: from, has_more: true })),
          get: vi.fn(async () => ({ report_id: 'rep_1', simulation_id: 'sim_1', status: 'completed' as const, markdown_content: 'md' })),
        },
      },
      { stage: 'report', ids: { ...ids, reportId: 'rep_1' } },
    )
    const next = await tick(run, deps)
    expect(next.stage).toBe('report')
    expect(next.status).toBe('running')
    expect((store.events.get(run.id) ?? []).some((e) => e.kind === 'report_text')).toBe(false)
  })

  it('a run with simStarted never calls start', async () => {
    const { deps, run } = await setup({}, { stage: 'sim_run', ids, cursors: { simStarted: true } })
    await drive(run, deps)
    expect(deps.mirofish.simulation.start).not.toHaveBeenCalled()
    expect(deps.mirofish.simulation.runStatus).toHaveBeenCalled()
  })

  it('every stage persists its id before its first event', async () => {
    const { store, deps, run } = await setup()
    const update = vi.spyOn(store, 'update')
    const append = vi.spyOn(store, 'appendEvent')
    await drive(run, deps)
    const firstOrder = (pred: (p: Parameters<typeof store.update>[1]) => boolean) =>
      update.mock.invocationCallOrder[update.mock.calls.findIndex((c) => pred(c[1]))] as number
    const firstEvent = (kind: string, stage?: string) =>
      append.mock.invocationCallOrder[
        append.mock.calls.findIndex((c) => c[1].kind === kind && (!stage || (c[1].payload as StageData).stage === stage))
      ] as number
    expect(firstOrder((p) => !!p.ids?.projectId)).toBeLessThan(firstEvent('ontology'))
    expect(firstOrder((p) => !!p.ids?.graphTaskId)).toBeLessThan(firstEvent('stage', 'graph_build'))
    expect(firstOrder((p) => !!p.ids?.simulationId)).toBeLessThan(firstEvent('stage', 'sim_create'))
    expect(firstOrder((p) => !!p.ids?.prepareTaskId)).toBeLessThan(firstEvent('stage', 'sim_prepare'))
    expect(firstOrder((p) => !!p.cursors?.simStarted)).toBeLessThan(firstEvent('stage', 'sim_run'))
    expect(firstOrder((p) => !!p.ids?.reportId)).toBeLessThan(firstEvent('stage', 'report'))
  })

  it.each([
    { stage: 'ontology' as const, at: { projectId: 'proj_1' }, entry: ['graph', 'generateOntology'], advancesTo: 'graph_build' },
    { stage: 'graph_build' as const, at: { projectId: 'proj_1', graphTaskId: 'gtask_1' }, entry: ['graph', 'build'], poll: ['graph', 'getTask'] },
    { stage: 'sim_create' as const, at: ids, entry: ['simulation', 'create'], advancesTo: 'sim_prepare' },
    { stage: 'sim_prepare' as const, at: { ...ids, prepareTaskId: 'ptask_1' }, entry: ['simulation', 'prepare'], poll: ['simulation', 'prepareStatus'] },
    { stage: 'sim_run' as const, at: ids, cursors: { simStarted: true }, entry: ['simulation', 'start'], poll: ['simulation', 'runStatus'] },
    { stage: 'report' as const, at: { ...ids, reportId: 'rep_1' }, entry: ['report', 'generate'], poll: ['report', 'agentLog'] },
  ])('resumes $stage with ids present by polling only', async ({ stage, at, cursors, entry, poll, advancesTo }) => {
    const { deps, run } = await setup({}, { stage, ids: at, cursors })
    const next = await tick(run, deps)
    expect(next.status).toBe('running')
    expect(next.stage).toBe(advancesTo ?? stage)
    const fn = (path: string[]) => (deps.mirofish as unknown as Record<string, Record<string, unknown>>)[path[0] as string]?.[path[1] as string]
    expect(fn(entry)).not.toHaveBeenCalled()
    if (poll) expect(fn(poll)).toHaveBeenCalledTimes(1)
  })

  it('ends the run when the stage is finished', async () => {
    const { store, deps, run } = await setup({}, { stage: 'finished', ids })
    const next = await tick(run, deps)
    expect(next).toMatchObject({ status: 'done', envState: 'open', finishedAt: NOW })
    const events = store.events.get(run.id) ?? []
    expect(events.map((e) => e.kind)).toEqual(['stage', 'done'])
    expect(events[0]).toMatchObject({ partId: 'stage:finished', payload: { stage: 'finished', status: 'done' } })
  })
})

describe('failures', () => {
  it('a failed graph task fails the run with stage(failed) then error', async () => {
    const { store, deps, run } = await setup(
      { graph: { getTask: vi.fn(async () => ({ task_id: 'gtask_1', status: 'failed' as const, progress: 30, error: 'Injected failure' })) } },
      { stage: 'graph_build', ids: { projectId: 'proj_1', graphTaskId: 'gtask_1' } },
    )
    const next = await tick(run, deps)
    expect(next.status).toBe('failed')
    expect(next.finishedAt).toEqual(NOW)
    expect(next.error).toEqual({ stage: 'graph_build', code: 'api', message: 'Injected failure' })
    const events = store.events.get(run.id) ?? []
    expect(events.slice(-2).map((e) => [e.kind, e.partId, e.payload])).toEqual([
      ['stage', 'stage:graph_build', { stage: 'graph_build', status: 'failed', message: 'Injected failure' }],
      ['error', null, { stage: 'graph_build', code: 'api', message: 'Injected failure' }],
    ])
  })

  it('retries a timeout on runStatus three times with backoff, then fails', async () => {
    const err = new MiroFishError({ code: 'timeout', message: 'MiroFish request timed out: /run-status', path: '/run-status' })
    const { store, deps, run } = await setup(
      { simulation: { runStatus: vi.fn(async () => Promise.reject(err)) } },
      { stage: 'sim_run', ids, cursors: { simStarted: true } },
    )
    const next = await drive(run, deps)
    expect(next.status).toBe('failed')
    expect(next.error).toEqual({ stage: 'sim_run', code: 'timeout', message: 'MiroFish request timed out: /run-status' })
    expect(deps.mirofish.simulation.runStatus).toHaveBeenCalledTimes(4)
    expect(vi.mocked(deps.sleep).mock.calls).toEqual([[2000], [4000], [8000]])
    expect((store.events.get(run.id) ?? []).map(label)).toEqual(['stage:sim_run:failed', 'error'])
  })

  it('resets the retry counter after a successful attempt', async () => {
    const err = new MiroFishError({ code: 'network', message: 'ECONNRESET', path: '/run-status' })
    const { deps, run } = await setup(
      {
        simulation: {
          runStatus: vi
            .fn()
            .mockRejectedValueOnce(err)
            .mockResolvedValue({ runner_status: 'running', current_round: 1, total_rounds: 2 }),
        },
      },
      { stage: 'sim_run', ids, cursors: { simStarted: true } },
    )
    const retried = await tick(run, deps)
    expect(retried.cursors.retries).toBe(1)
    expect(retried.status).toBe('running')
    const recovered = await tick(retried, deps)
    expect(recovered.cursors.retries).toBe(0)
  })

  it.each([
    { name: 'api', err: new MiroFishError({ code: 'api', message: 'bad project', path: '/b' }), code: 'api' },
    { name: 'schema', err: new MiroFishError({ code: 'schema', message: 'bad shape', path: '/b' }), code: 'schema' },
    { name: 'http 404', err: new MiroFishError({ code: 'http', status: 404, message: 'not found', path: '/b' }), code: 'http' },
  ])('fails immediately on $name', async ({ err, code }) => {
    const { deps, run } = await setup({ graph: { build: vi.fn(async () => Promise.reject(err)) } }, { stage: 'graph_build', ids: { projectId: 'proj_1' } })
    const next = await tick(run, deps)
    expect(next.status).toBe('failed')
    expect(next.error?.code).toBe(code)
    expect(deps.mirofish.graph.build).toHaveBeenCalledTimes(1)
    expect(deps.sleep).not.toHaveBeenCalled()
  })

  it('retries http 5xx', async () => {
    const err = new MiroFishError({ code: 'http', status: 502, message: 'bad gateway', path: '/b' })
    const { deps, run } = await setup(
      { graph: { build: vi.fn().mockRejectedValueOnce(err).mockResolvedValue({ project_id: 'proj_1', task_id: 'gtask_1' }) } },
      { stage: 'graph_build', ids: { projectId: 'proj_1' } },
    )
    const retried = await tick(run, deps)
    expect(retried.status).toBe('running')
    expect(deps.sleep).toHaveBeenCalledWith(2000)
    const entered = await tick(retried, deps)
    expect(entered.ids.graphTaskId).toBe('gtask_1')
  })

  it('maps non-MiroFish errors to internal with a single-line message', async () => {
    const { deps, run } = await setup()
    vi.mocked(deps.storage.get).mockRejectedValue(new StorageError('not_found', 'upload missing\n    at Object.get (local.ts:1:1)'))
    const next = await tick(run, deps)
    expect(next.status).toBe('failed')
    expect(next.error).toEqual({ stage: 'ontology', code: 'internal', message: 'upload missing' })
    expect(deps.mirofish.graph.generateOntology).not.toHaveBeenCalled()
  })
})
