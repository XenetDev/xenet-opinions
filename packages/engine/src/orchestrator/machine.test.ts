import { MiroFishError } from '@xo/mirofish'
import { StorageError } from '@xo/storage'
import { describe, expect, it, vi } from 'vitest'
import type { StageData } from '../parts'
import { FenceError } from '../store/types'
import { fail } from './fail'
import { tick } from './machine'
import { drive, driveUntil, LOGS, NOW, setupRun as setup } from './test-helpers'

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
  it('closes the env state with no keepalive when a run finishes', async () => {
    const { deps, run } = await setup({}, { stage: 'finished', ids })
    const done = await tick(run, deps)
    expect(done).toMatchObject({ status: 'done', envState: 'closed', envKeepaliveUntil: null })
  })

  it('drives a run through every stage to done', async () => {
    const { store, deps, run } = await setup()
    const done = await drive(run, deps)
    expect(done.status).toBe('done')
    expect(done.envState).toBe('closed')
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
      'stage:sim_run:running',
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
    expect(payloadOf('sources')).toEqual([
      { files: [{ id: 'up_1', filename: 'brief.md', mediaType: 'text/markdown', sizeBytes: 12 }] },
    ])
    expect(payloadOf('report_text')).toEqual([{ markdown: '# Report' }])
    expect(payloadOf('agents').at(-1)).toMatchObject({ count: 2, platform: 'reddit' })
    expect(events.some((e) => e.kind === 'interview_window' || e.partId === 'stage:interviews')).toBe(false)
    expect(deps.mirofish.simulation.interviewBatch).not.toHaveBeenCalled()
    expect(payloadOf('sim_feed').at(-1)).toMatchObject({ round: 2, totalRounds: 2, twitterActs: 2, redditActs: 2 })
    expect(events.find((e) => e.kind === 'stage' && (e.payload as StageData).message === 'Round 1/2')).toBeDefined()
    expect(deps.storage.get).toHaveBeenCalledWith('k/brief.md')
    const mf = deps.mirofish
    expect(mf.graph.generateOntology).toHaveBeenCalledWith({
      files: [{ name: 'brief.md', bytes: new Uint8Array([1]), type: 'text/markdown' }],
      requirement: 'React?',
    })
    expect(mf.simulation.start).toHaveBeenCalledWith({ simulationId: 'sim_1', maxRounds: 2 })
    for (const c of vi.mocked(mf.simulation.posts).mock.calls)
      expect(c[1]).toMatchObject({ platform: expect.any(String), limit: 50 })
    expect(vi.mocked(mf.simulation.posts).mock.calls.map((c) => [c[1].platform, c[1].offset])).toEqual([
      ['twitter', 0],
      ['reddit', 0],
      ['twitter', 1],
      ['reddit', 1],
      ['twitter', 2],
      ['reddit', 2],
    ])
    expect(mf.simulation.closeEnv).toHaveBeenCalledTimes(1)
    expect(mf.simulation.closeEnv).toHaveBeenCalledWith('sim_1')
    expect(vi.mocked(mf.report.agentLog).mock.calls.map((c) => c[1])).toEqual([0, 3, 6])
    for (const fn of [
      mf.graph.generateOntology,
      mf.graph.build,
      mf.simulation.create,
      mf.simulation.prepare,
      mf.simulation.start,
      mf.report.generate,
    ]) {
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
          get: vi.fn(async () => ({
            report_id: 'rep_1',
            simulation_id: 'sim_1',
            status: 'completed' as const,
            markdown_content: 'md',
          })),
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
    const { deps, run } = await setup(
      { simulation: { start: vi.fn(async () => Promise.reject(err)) } },
      { stage: 'sim_run', ids },
    )
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
    const { deps, run } = await setup(
      { simulation: { start: vi.fn(async () => Promise.reject(err)) } },
      { stage: 'sim_run', ids },
    )
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
          runStatus: vi
            .fn()
            .mockResolvedValueOnce(idle)
            .mockResolvedValueOnce(idle)
            .mockResolvedValue({ runner_status: 'running', current_round: 0 }),
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
    expect(next.error).toEqual({
      stage: 'sim_run',
      code: 'api',
      message: 'simulation backend reported idle after start',
    })
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
      {
        simulation: {
          start: vi.fn(async () => Promise.reject(err)),
          runStatus: vi.fn(async () => ({ runner_status: 'idle' as const })),
        },
      },
      { stage: 'sim_run', ids, cursors: { simStarted: true } },
    )
    const next = await drive(run, deps)
    expect(next.status).toBe('failed')
    expect(next.error).toEqual({ stage: 'sim_run', code: 'internal', message: 'simulation never started' })
    expect(deps.mirofish.simulation.runStatus).toHaveBeenCalledTimes(8)
    expect(deps.mirofish.simulation.start).toHaveBeenCalledTimes(3)
    expect((store.events.get(run.id) ?? []).map(label).slice(-2)).toEqual(['stage:sim_run:failed', 'error'])
  })

  it('treats a prepare status of ready as prepared', async () => {
    const { deps, run } = await setup(
      {
        simulation: {
          prepareStatus: vi.fn(async () => ({ simulation_id: 'sim_1', status: 'ready' as const, progress: 100 })),
        },
      },
      { stage: 'sim_prepare', ids: { ...ids, prepareTaskId: 'ptask_1' } },
    )
    expect((await tick(run, deps)).stage).toBe('sim_run')
  })

  it('records the simulation platform on the agents part when prepare finishes', async () => {
    const twitter = await setup(
      { simulation: { configRealtime: vi.fn(async () => ({ config: { twitter_config: {} } })) } },
      { stage: 'sim_prepare', ids: { ...ids, prepareTaskId: 'ptask_1' }, cursors: { lastAgentCount: 2 } },
    )
    let next = await tick(twitter.run, twitter.deps)
    next = await tick(next, twitter.deps)
    expect(next.stage).toBe('sim_run')
    const agents = (twitter.store.events.get(next.id) ?? []).filter((e) => e.kind === 'agents')
    expect(agents.at(-1)?.payload).toMatchObject({ count: 2, platform: 'twitter' })
    expect(twitter.deps.mirofish.simulation.configRealtime).toHaveBeenCalledWith('sim_1')
    const down = await setup(
      { simulation: { configRealtime: vi.fn(async () => Promise.reject(new Error('404'))) } },
      { stage: 'sim_prepare', ids: { ...ids, prepareTaskId: 'ptask_1' } },
    )
    await drive(down.run, down.deps)
    const last = (down.store.events.get(down.run.id) ?? []).filter((e) => e.kind === 'agents').at(-1)
    expect(last?.payload).toMatchObject({ platform: 'reddit' })
  })

  it('closes the env once after the last round and stays in sim_run through stopping', async () => {
    const roundsDone = {
      runner_status: 'running' as const,
      current_round: 1,
      total_rounds: 1,
      twitter_completed: true,
      reddit_completed: true,
    }
    const { deps, run } = await setup(
      {
        simulation: {
          runStatus: vi
            .fn()
            .mockResolvedValueOnce(roundsDone)
            .mockResolvedValueOnce(roundsDone)
            .mockResolvedValue({ ...roundsDone, runner_status: 'stopping' }),
          posts: vi.fn(async () => ({ posts: [] })),
        },
      },
      { stage: 'sim_run', ids, cursors: { simStarted: true, startAcked: true } },
    )
    let current = run
    for (let i = 0; i < 3; i++) {
      current = await tick(current, deps)
      expect(current.stage).toBe('sim_run')
      expect(current.status).toBe('running')
      expect(current.cursors.envCloseRequested).toBe(true)
    }
    expect(deps.mirofish.simulation.closeEnv).toHaveBeenCalledTimes(1)
    expect(deps.mirofish.simulation.closeEnv).toHaveBeenCalledWith('sim_1')
  })

  it('waits while report generation is refused for pending ingestion, then enters', async () => {
    const pending = new MiroFishError({
      code: 'api',
      status: 409,
      path: '/api/report/generate',
      message:
        'Simulation or Zep graph ingestion is still active; wait for a terminal run status before generating a report',
    })
    const { store, deps, run } = await setup(
      {
        report: {
          generate: vi
            .fn()
            .mockRejectedValueOnce(pending)
            .mockResolvedValue({ simulation_id: 'sim_1', report_id: 'rep_1', task_id: 'rtask_1' }),
        },
      },
      { stage: 'report', ids },
    )
    const waiting = await tick(run, deps)
    expect(waiting.stage).toBe('report')
    expect(waiting.status).toBe('running')
    expect(waiting.ids.reportId).toBeUndefined()
    expect(waiting.error).toBeNull()
    const entered = await tick(waiting, deps)
    expect(entered.ids.reportId).toBe('rep_1')
    expect(deps.mirofish.report.generate).toHaveBeenCalledTimes(2)
    expect((store.events.get(run.id) ?? []).map(label)).not.toContain('error')
  })

  it('still fails the run on other report generation errors', async () => {
    const { deps, run } = await setup(
      {
        report: {
          generate: vi.fn(async () => {
            throw new MiroFishError({ code: 'api', status: 400, path: '/api/report/generate', message: 'bad' })
          }),
        },
      },
      { stage: 'report', ids },
    )
    expect((await tick(run, deps)).status).toBe('failed')
  })

  it('fetches the posts backlog on completion and keeps the newest 50', async () => {
    const page = (platform: 'twitter' | 'reddit', offset: number, n: number) =>
      Array.from({ length: n }, (_, i) => ({
        post_id: `${platform}_${offset + i}`,
        agent_name: 'a',
        content: 'c',
        round: Math.floor((offset + i) / 10) + 1,
        platform,
      }))
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
    const feed = (store.events.get(run.id) ?? []).find((e) => e.kind === 'sim_feed')?.payload as {
      posts: Array<{ round: number }>
    }
    expect(feed.posts).toHaveLength(50)
    expect(feed.posts.every((p) => p.round >= 2)).toBe(true)
    expect(feed.posts.at(-1)?.round).toBe(6)
  })

  it('does not emit the report text until a drain after completion reaches an empty page', async () => {
    const line = { action: 'tool_call', details: { tool_name: 'quick_search' } }
    const { store, deps, run } = await setup(
      {
        report: {
          agentLog: vi.fn(async (_id: string, from: number) => ({
            logs: [line],
            total_lines: from + 1,
            from_line: from,
            has_more: true,
          })),
          get: vi.fn(async () => ({
            report_id: 'rep_1',
            simulation_id: 'sim_1',
            status: 'completed' as const,
            markdown_content: 'md',
          })),
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
        append.mock.calls.findIndex(
          (c) => c[1].kind === kind && (!stage || (c[1].payload as StageData).stage === stage),
        )
      ] as number
    expect(firstOrder((p) => !!p.ids?.projectId)).toBeLessThan(firstEvent('ontology'))
    expect(firstOrder((p) => !!p.ids?.graphTaskId)).toBeLessThan(firstEvent('stage', 'graph_build'))
    expect(firstOrder((p) => !!p.ids?.simulationId)).toBeLessThan(firstEvent('stage', 'sim_create'))
    expect(firstOrder((p) => !!p.ids?.prepareTaskId)).toBeLessThan(firstEvent('stage', 'sim_prepare'))
    expect(firstOrder((p) => !!p.cursors?.simStarted)).toBeLessThan(firstEvent('stage', 'sim_run'))
    expect(firstOrder((p) => !!p.ids?.reportId)).toBeLessThan(firstEvent('stage', 'report'))
  })

  it.each([
    {
      stage: 'ontology' as const,
      at: { projectId: 'proj_1' },
      entry: ['graph', 'generateOntology'],
      advancesTo: 'graph_build',
    },
    {
      stage: 'graph_build' as const,
      at: { projectId: 'proj_1', graphTaskId: 'gtask_1' },
      entry: ['graph', 'build'],
      poll: ['graph', 'getTask'],
    },
    { stage: 'sim_create' as const, at: ids, entry: ['simulation', 'create'], advancesTo: 'sim_prepare' },
    {
      stage: 'sim_prepare' as const,
      at: { ...ids, prepareTaskId: 'ptask_1' },
      entry: ['simulation', 'prepare'],
      poll: ['simulation', 'prepareStatus'],
    },
    {
      stage: 'sim_run' as const,
      at: ids,
      cursors: { simStarted: true },
      entry: ['simulation', 'start'],
      poll: ['simulation', 'runStatus'],
    },
    {
      stage: 'report' as const,
      at: { ...ids, reportId: 'rep_1' },
      entry: ['report', 'generate'],
      poll: ['report', 'agentLog'],
    },
  ])('resumes $stage with ids present by polling only', async ({ stage, at, cursors, entry, poll, advancesTo }) => {
    const { deps, run } = await setup({}, { stage, ids: at, cursors })
    const next = await tick(run, deps)
    expect(next.status).toBe('running')
    expect(next.stage).toBe(advancesTo ?? stage)
    const fn = (path: string[]) =>
      (deps.mirofish as unknown as Record<string, Record<string, unknown>>)[path[0] as string]?.[path[1] as string]
    expect(fn(entry)).not.toHaveBeenCalled()
    if (poll) expect(fn(poll)).toHaveBeenCalledTimes(1)
  })

  it('ends the run when the stage is finished', async () => {
    const { store, deps, run } = await setup({}, { stage: 'finished', ids })
    const next = await tick(run, deps)
    expect(next).toMatchObject({ status: 'done', envState: 'closed', envKeepaliveUntil: null, finishedAt: NOW })
    const events = store.events.get(run.id) ?? []
    expect(events.map((e) => e.kind)).toEqual(['stage', 'done'])
    expect(events[0]).toMatchObject({ partId: 'stage:finished', payload: { stage: 'finished', status: 'done' } })
  })
})

describe('failures', () => {
  it('a failed graph task fails the run with stage(failed) then error', async () => {
    const { store, deps, run } = await setup(
      {
        graph: {
          getTask: vi.fn(async () => ({
            task_id: 'gtask_1',
            status: 'failed' as const,
            progress: 30,
            error: 'Injected failure',
          })),
        },
      },
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
    const err = new MiroFishError({
      code: 'timeout',
      message: 'MiroFish request timed out: /run-status',
      path: '/run-status',
    })
    const { store, deps, run } = await setup(
      { simulation: { runStatus: vi.fn(async () => Promise.reject(err)) } },
      { stage: 'sim_run', ids, cursors: { simStarted: true } },
    )
    const next = await drive(run, deps)
    expect(next.status).toBe('failed')
    expect(next.error).toEqual({
      stage: 'sim_run',
      code: 'timeout',
      message: 'MiroFish request timed out: /run-status',
    })
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
    {
      name: 'http 404',
      err: new MiroFishError({ code: 'http', status: 404, message: 'not found', path: '/b' }),
      code: 'http',
    },
  ])('fails immediately on $name', async ({ err, code }) => {
    const { deps, run } = await setup(
      { graph: { build: vi.fn(async () => Promise.reject(err)) } },
      { stage: 'graph_build', ids: { projectId: 'proj_1' } },
    )
    const next = await tick(run, deps)
    expect(next.status).toBe('failed')
    expect(next.error?.code).toBe(code)
    expect(deps.mirofish.graph.build).toHaveBeenCalledTimes(1)
    expect(deps.sleep).not.toHaveBeenCalled()
  })

  it('retries http 5xx', async () => {
    const err = new MiroFishError({ code: 'http', status: 502, message: 'bad gateway', path: '/b' })
    const { deps, run } = await setup(
      {
        graph: {
          build: vi.fn().mockRejectedValueOnce(err).mockResolvedValue({ project_id: 'proj_1', task_id: 'gtask_1' }),
        },
      },
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
    vi.mocked(deps.storage.get).mockRejectedValue(
      new StorageError('not_found', 'upload missing\n    at Object.get (local.ts:1:1)'),
    )
    const next = await tick(run, deps)
    expect(next.status).toBe('failed')
    expect(next.error).toEqual({ stage: 'ontology', code: 'internal', message: 'upload missing' })
    expect(deps.mirofish.graph.generateOntology).not.toHaveBeenCalled()
  })

  it('rejects with FenceError and writes nothing when another worker owns the lease', async () => {
    const { store, deps, run } = await setup()
    store.runs.set(run.id, { ...store.runs.get(run.id)!, leaseOwner: 'w2' })
    await expect(tick(run, { ...deps, fence: { owner: 'w1' } })).rejects.toBeInstanceOf(FenceError)
    expect(store.events.get(run.id) ?? []).toEqual([])
    expect(store.runs.get(run.id)).toMatchObject({ status: 'running', stage: 'ontology', ids: {} })
  })

  it('flows fenced writes when the fence matches the lease owner', async () => {
    const { store, deps, run } = await setup()
    const next = await tick(run, { ...deps, fence: { owner: 'w1' } })
    expect(next.stage).toBe('graph_build')
    expect((store.events.get(run.id) ?? []).map(label)).toEqual([
      'stage:ontology:running',
      'sources',
      'ontology',
      'stage:ontology:done',
    ])
  })
})

describe('interview window', () => {
  const MIN = 60_000
  const entered = (r: { stage: string; cursors: { interviewsStartedAt?: string } }) =>
    r.stage === 'interviews' && Boolean(r.cursors.interviewsStartedAt)

  const paused = async (o: Parameters<typeof setup>[0] = {}) => {
    const ctx = await setup(o, undefined, { pauseForInterviews: true })
    let clock = NOW
    ctx.deps.now = () => clock
    const run = await driveUntil(ctx.run, ctx.deps, entered)
    const ask = (agentIds: string[], question = 'Q?', questionId = 'q1') =>
      ctx.store.createInterviews(
        agentIds.map((agentId, i) => ({
          id: `${questionId}_${i}`,
          chatId: 'c1',
          runId: run.id,
          messageId: 'm1',
          agentId,
          agentName: agentId === '0' ? 'Maya' : 'Liam',
          question,
          status: 'pending',
          questionId,
        })),
      )
    const setClock = (ms: number) => {
      clock = new Date(NOW.getTime() + ms)
    }
    const events = () => ctx.store.events.get(run.id) ?? []
    const payloads = (kind: string) =>
      events()
        .filter((e) => e.kind === kind)
        .map((e) => e.payload)
    return { ...ctx, run, ask, setClock, events, payloads }
  }

  it('pauses after the rounds with personas online and the env open', async () => {
    const { deps, run, events } = await paused()
    expect(run).toMatchObject({ status: 'running', stage: 'interviews', envState: 'open' })
    expect(run.envKeepaliveUntil).toEqual(new Date(NOW.getTime() + 20 * MIN))
    expect(run.cursors.interviewsStartedAt).toBe(NOW.toISOString())
    expect(events().map(label).slice(-4)).toEqual([
      'sim_feed',
      'stage:sim_run:done',
      'stage:interviews:running',
      'interview_window',
    ])
    expect(events().at(-1)).toMatchObject({
      partId: 'interview_window',
      payload: { until: new Date(NOW.getTime() + 20 * MIN).toISOString(), personaCount: 2, closed: false },
    })
    expect(deps.mirofish.simulation.closeEnv).not.toHaveBeenCalled()
    const statusCalls = vi.mocked(deps.mirofish.simulation.runStatus).mock.calls.length
    const idle = await tick(run, deps)
    expect(idle.stage).toBe('interviews')
    expect(deps.mirofish.simulation.runStatus).toHaveBeenCalledTimes(statusCalls)
    expect(deps.mirofish.simulation.interviewBatch).not.toHaveBeenCalled()
  })

  it('interviews one pending persona per tick with platform and timeout', async () => {
    const { deps, run, store, ask, payloads } = await paused()
    expect(run.cursors.agentsPlatform).toBe('reddit')
    await ask(['0'])
    const listEvents = vi.spyOn(store, 'listEvents')
    const next = await tick(run, deps)
    expect(listEvents).not.toHaveBeenCalled()
    expect(next.stage).toBe('interviews')
    expect(deps.mirofish.simulation.interviewBatch).toHaveBeenCalledTimes(1)
    expect(deps.mirofish.simulation.interviewBatch).toHaveBeenCalledWith(
      { simulationId: 'sim_1', interviews: [{ agentId: 0, prompt: 'Q?' }], platform: 'reddit', timeout: 240 },
      { timeoutMs: 270_000 },
    )
    expect(store.interviews.get('q1_0')).toMatchObject({ status: 'done', answer: 'Answer from 0' })
    expect(payloads('interview')).toEqual([
      {
        id: 'q1_0',
        questionId: 'q1',
        agentId: '0',
        agentName: 'Maya',
        question: 'Q?',
        status: 'done',
        answer: 'Answer from 0',
      },
    ])
    expect(deps.mirofish.simulation.closeEnv).not.toHaveBeenCalled()
  })

  it.each([
    [new MiroFishError({ code: 'api', message: 'x', path: '/i' }), 'Agents are offline'],
    [new MiroFishError({ code: 'http', status: 502, message: 'x', path: '/i' }), 'Agents are offline'],
    [new MiroFishError({ code: 'timeout', message: 'x', path: '/i' }), 'No answer in time'],
    [new Error('boom'), 'Interview failed'],
  ])('fails the persona without failing the run on %s', async (err, message) => {
    const { deps, run, store, ask, payloads } = await paused({
      simulation: { interviewBatch: vi.fn(async () => Promise.reject(err)) },
    })
    await ask(['0'])
    const next = await tick(run, deps)
    expect(next).toMatchObject({ status: 'running', stage: 'interviews' })
    expect(store.interviews.get('q1_0')?.status).toBe('failed')
    expect(payloads('interview').at(-1)).toMatchObject({ status: 'failed', error: message })
    expect(deps.sleep).not.toHaveBeenCalled()
  })

  it('finishes the pending persona before closing on a report request', async () => {
    const { deps, run, store, ask, payloads } = await paused()
    await ask(['0'])
    await store.update(run.id, { cursors: { reportRequested: true } })
    let current = await tick(run, deps)
    expect(deps.mirofish.simulation.interviewBatch).toHaveBeenCalledTimes(1)
    expect(deps.mirofish.simulation.closeEnv).not.toHaveBeenCalled()
    current = await tick(current, deps)
    expect(deps.mirofish.simulation.closeEnv).toHaveBeenCalledTimes(1)
    expect(current.stage).toBe('interviews')
    current = await tick(current, deps)
    expect(current).toMatchObject({ stage: 'report', envState: 'closed', envKeepaliveUntil: null })
    expect(payloads('interview_window').at(-1)).toEqual({
      until: null,
      personaCount: 2,
      closed: true,
      reason: 'report_requested',
    })
    const order = (fn: unknown) => vi.mocked(fn as () => void).mock.invocationCallOrder[0] as number
    expect(order(deps.mirofish.simulation.interviewBatch)).toBeLessThan(order(deps.mirofish.simulation.closeEnv))
    const done = await drive(current, deps)
    expect(done.status).toBe('done')
    expect(deps.mirofish.simulation.closeEnv).toHaveBeenCalledTimes(1)
  })

  it('completes every pending persona after expiry, then closes once', async () => {
    const { deps, run, ask, setClock, events } = await paused()
    await ask(['0', '1'])
    setClock(21 * MIN)
    let current = await tick(run, deps)
    current = await tick(current, deps)
    expect(deps.mirofish.simulation.interviewBatch).toHaveBeenCalledTimes(2)
    expect(deps.mirofish.simulation.closeEnv).not.toHaveBeenCalled()
    current = await tick(current, deps)
    current = await tick(current, deps)
    expect(current.stage).toBe('report')
    expect(deps.mirofish.simulation.closeEnv).toHaveBeenCalledTimes(1)
    const labels = events().map(label)
    expect(labels.slice(labels.indexOf('stage:interviews:running'))).toEqual([
      'stage:interviews:running',
      'interview_window',
      'interview',
      'interview',
      'interview_window',
      'stage:interviews:done',
    ])
    expect(events().at(-2)?.payload).toMatchObject({ closed: true, reason: 'expired' })
  })

  it('checks the env every 30 seconds and ends the window when the runner stopped', async () => {
    const { deps, run, store, ask, setClock, payloads } = await paused({
      simulation: {
        runStatus: vi
          .fn()
          .mockResolvedValueOnce({ runner_status: 'running', current_round: 1, total_rounds: 2 })
          .mockResolvedValueOnce({
            runner_status: 'running',
            current_round: 2,
            total_rounds: 2,
            twitter_completed: true,
            reddit_completed: true,
          })
          .mockResolvedValueOnce({ runner_status: 'running' })
          .mockResolvedValue({ runner_status: 'stopped' }),
      },
    })
    setClock(29_000)
    let current = await tick(run, deps)
    expect(deps.mirofish.simulation.runStatus).toHaveBeenCalledTimes(2)
    setClock(30_000)
    current = await tick(current, deps)
    expect(deps.mirofish.simulation.runStatus).toHaveBeenCalledTimes(3)
    expect(current.cursors.envCheckedAt).toBe(new Date(NOW.getTime() + 30_000).toISOString())
    setClock(59_000)
    current = await tick(current, deps)
    expect(deps.mirofish.simulation.runStatus).toHaveBeenCalledTimes(3)
    await ask(['0'])
    vi.spyOn(store, 'listPendingInterviews').mockResolvedValueOnce([])
    setClock(60_000)
    current = await tick(current, deps)
    expect(current).toMatchObject({ stage: 'report', envState: 'closed' })
    expect(store.interviews.get('q1_0')?.status).toBe('failed')
    expect(payloads('interview').at(-1)).toMatchObject({ id: 'q1_0', status: 'failed', error: 'Agents are offline' })
    expect(payloads('interview_window').at(-1)).toMatchObject({ closed: true, reason: 'environment_stopped' })
    expect(deps.mirofish.simulation.closeEnv).not.toHaveBeenCalled()
    expect(deps.mirofish.simulation.interviewBatch).not.toHaveBeenCalled()
  })

  it('ends the window when the env check gets an api error', async () => {
    const { deps, run, store, ask, setClock, payloads } = await paused({
      simulation: {
        runStatus: vi
          .fn()
          .mockResolvedValueOnce({ runner_status: 'running', current_round: 1, total_rounds: 2 })
          .mockResolvedValueOnce({
            runner_status: 'running',
            current_round: 2,
            total_rounds: 2,
            twitter_completed: true,
            reddit_completed: true,
          })
          .mockRejectedValue(new MiroFishError({ code: 'api', status: 404, message: 'gone', path: '/run-status' })),
      },
    })
    await ask(['0'])
    vi.spyOn(store, 'listPendingInterviews').mockResolvedValueOnce([])
    setClock(30_000)
    const next = await tick(run, deps)
    expect(next).toMatchObject({ status: 'running', stage: 'report', envState: 'closed' })
    expect(payloads('interview_window').at(-1)).toMatchObject({ closed: true, reason: 'environment_stopped' })
    expect(store.interviews.get('q1_0')?.status).toBe('failed')
  })

  it('leaves a transient env check error to the retry path', async () => {
    const { deps, run, setClock } = await paused({
      simulation: {
        runStatus: vi
          .fn()
          .mockResolvedValueOnce({ runner_status: 'running', current_round: 1, total_rounds: 2 })
          .mockResolvedValueOnce({
            runner_status: 'running',
            current_round: 2,
            total_rounds: 2,
            twitter_completed: true,
            reddit_completed: true,
          })
          .mockRejectedValue(new MiroFishError({ code: 'network', message: 'ECONNRESET', path: '/run-status' })),
      },
    })
    setClock(30_000)
    const next = await tick(run, deps)
    expect(next).toMatchObject({ status: 'running', stage: 'interviews' })
    expect(next.cursors.retries).toBe(1)
  })

  it('fails with env_stuck when the env does not close in time', async () => {
    const { deps, run, store, setClock } = await paused({
      simulation: {
        runStatus: vi
          .fn()
          .mockResolvedValueOnce({ runner_status: 'running', current_round: 1, total_rounds: 2 })
          .mockResolvedValueOnce({
            runner_status: 'running',
            current_round: 2,
            total_rounds: 2,
            twitter_completed: true,
            reddit_completed: true,
          })
          .mockResolvedValue({ runner_status: 'stopping' }),
      },
    })
    await store.update(run.id, { cursors: { reportRequested: true } })
    const closing = await tick(run, deps)
    setClock(3 * MIN + 1)
    const failed = await tick(closing, deps)
    expect(failed).toMatchObject({ status: 'failed', envState: 'closed' })
    expect(failed.error).toMatchObject({ stage: 'interviews', code: 'env_stuck' })
    expect(deps.mirofish.simulation.stop).toHaveBeenCalledWith('sim_1')
  })

  it('fail() in interviews stops and closes the env and fails pending interviews', async () => {
    const { deps, run, store, ask, payloads } = await paused()
    await ask(['0', '1'])
    const failed = await fail(run, deps, 'interviews', new Error('boom'))
    expect(failed).toMatchObject({ status: 'failed', envState: 'closed', envKeepaliveUntil: null })
    expect(await store.listPendingInterviews(run.id)).toEqual([])
    expect(store.interviews.get('q1_1')?.status).toBe('failed')
    expect(payloads('interview')).toEqual([
      expect.objectContaining({ id: 'q1_0', status: 'failed', error: 'Agents are offline' }),
      expect.objectContaining({ id: 'q1_1', status: 'failed', error: 'Agents are offline' }),
    ])
    expect(deps.mirofish.simulation.stop).toHaveBeenCalledWith('sim_1')
    expect(deps.mirofish.simulation.closeEnv).toHaveBeenCalledWith('sim_1')
  })

  it('fail() before sim_run leaves MiroFish alone', async () => {
    const { deps, run } = await setup({}, { stage: 'sim_prepare', ids })
    await fail(run, deps, 'sim_prepare', new Error('boom'))
    expect(deps.mirofish.simulation.stop).not.toHaveBeenCalled()
    expect(deps.mirofish.simulation.closeEnv).not.toHaveBeenCalled()
  })
})
