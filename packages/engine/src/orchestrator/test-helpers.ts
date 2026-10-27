import type { Run, RunConfig, RunCursors, RunIds } from '@xo/db'
import type { MiroFishClient } from '@xo/mirofish'
import { vi } from 'vitest'
import { createMemoryStore } from '../store/memory'
import type { RunStore } from '../store/types'
import { tick } from './machine'
import type { Deps } from './types'

export type Overrides = { [K in keyof MiroFishClient]?: Partial<MiroFishClient[K]> }

export const NOW = new Date('2026-10-20T12:00:00Z')
export const LOGS = [
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

export const fakeClient = (o: Overrides = {}): MiroFishClient =>
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
        .mockResolvedValueOnce({
          task_id: 'ptask_1',
          status: 'processing',
          progress: 50,
          progress_detail: { current_stage_name: 'Profiles' },
        })
        .mockResolvedValue({ simulation_id: 'sim_1', status: 'ready', progress: 100, already_prepared: true }),
      profilesRealtime: vi
        .fn()
        .mockResolvedValueOnce({ profiles: [{ agent_id: 0, name: 'Maya' }], total_expected: 2 })
        .mockResolvedValue({
          profiles: [
            { agent_id: 0, name: 'Maya' },
            { agent_id: 1, name: 'Liam' },
          ],
          total_expected: 2,
        }),
      start: vi.fn(async () => ({ runner_status: 'starting' })),
      runStatus: vi
        .fn()
        .mockResolvedValueOnce({ runner_status: 'running', current_round: 1, total_rounds: 2, progress_percent: 50 })
        .mockResolvedValueOnce({
          runner_status: 'running',
          current_round: 2,
          total_rounds: 2,
          progress_percent: 100,
          twitter_completed: true,
          reddit_completed: true,
        })
        .mockResolvedValue({ runner_status: 'completed', current_round: 2, total_rounds: 2, progress_percent: 100 }),
      posts: vi.fn(async (_id: string, q: { platform: 'twitter' | 'reddit'; offset?: number }) =>
        q.offset ? { posts: q.offset === 1 ? [post(q.platform, 2)] : [] } : { posts: [post(q.platform, 1)] },
      ),
      configRealtime: vi.fn(async () => ({ config: { platform_configs: { reddit: {}, twitter: {} } } })),
      stop: vi.fn(),
      closeEnv: vi.fn(),
      interviewBatch: vi.fn(async (input: { interviews: Array<{ agentId: number | string }> }) => ({
        result: {
          results: Object.fromEntries(
            input.interviews.map((i) => [
              `reddit_${i.agentId}`,
              { agent_id: i.agentId, platform: 'reddit', response: `Answer from ${i.agentId}` },
            ]),
          ),
        },
      })),
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
        .mockResolvedValue({
          report_id: 'rep_1',
          simulation_id: 'sim_1',
          status: 'completed',
          markdown_content: '# Report',
        }),
      chat: vi.fn(),
      ...o.report,
    },
  }) as unknown as MiroFishClient

export const happyDeps = (store: RunStore, o: Overrides = {}): Deps => ({
  store,
  mirofish: fakeClient(o),
  storage: { get: vi.fn(async () => new Uint8Array([1])), put: vi.fn(), delete: vi.fn() },
  now: () => NOW,
  sleep: vi.fn(async () => {}),
  log: vi.fn(),
})

export const drive = async (run: Run, deps: Deps, cap = 50) => {
  let steps = 0
  while (run.status === 'running') {
    if (++steps > cap) throw new Error('step cap exceeded')
    run = await tick(run, deps)
  }
  return run
}

export const driveUntil = async (run: Run, deps: Deps, done: (run: Run) => boolean, cap = 50) => {
  let steps = 0
  while (run.status === 'running' && !done(run)) {
    if (++steps > cap) throw new Error('step cap exceeded')
    run = await tick(run, deps)
  }
  return run
}

export const setupRun = async (
  o: Overrides = {},
  at?: { stage: Run['stage']; ids?: RunIds; cursors?: RunCursors },
  config: Partial<RunConfig> = {},
) => {
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
  await store.create({
    chatId: 'c1',
    userId: 'u1',
    assistantMessageId: 'm1',
    config: { requirement: 'React?', maxRounds: 2, uploadIds: ['up_1'], ...config },
  })
  let run = (await store.claimNext('w1', 60_000, 1)) as Run
  if (at) run = await store.update(run.id, { stage: at.stage, ids: at.ids ?? {}, cursors: at.cursors ?? {} })
  const deps = happyDeps(store, o)
  return { store, deps, run }
}
