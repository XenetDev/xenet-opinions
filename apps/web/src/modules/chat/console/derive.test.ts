import { type OpinionsUIMessage, STAGES, type Stage, type StageStatus } from '@xo/engine/parts'
import { describe, expect, it } from 'vitest'
import { deriveConsole } from './derive'

type Parts = OpinionsUIMessage['parts']

const NOW = Date.parse('2026-10-28T10:00:00Z')
const live = { now: NOW }

const stage = (name: Stage, status: StageStatus, message?: string): Parts[number] => ({
  type: 'data-stage',
  id: `stage:${name}`,
  data: { stage: name, status, ...(message ? { message } : {}) },
})

const through = (last: Stage, status: StageStatus, message?: string): Parts => {
  const order: Stage[] = STAGES.filter((name) => name !== 'interviews')
  const index = order.indexOf(last)
  return [...order.slice(0, index).map((name) => stage(name, 'done')), stage(last, status, message)]
}

const kinds = (rows: { kind: string }[]) => rows.map((row) => row.kind)

describe('deriveConsole', () => {
  it('shows a queued run as one waiting row', () => {
    const model = deriveConsole([{ type: 'data-queue', data: { position: 2 } }], live)
    expect(model.status).toBe('queued')
    expect(model.rows).toHaveLength(1)
    expect(model.rows[0]).toMatchObject({ kind: 'queued', title: 'Waiting for a free slot, #2 in queue' })
  })

  it('explains a paused run ahead in the queue', () => {
    const model = deriveConsole([{ type: 'data-queue', data: { position: 1, pausedAhead: true } }], live)
    expect(model.rows[0]?.detail).toBe('A run is paused for interviews; yours starts when it finishes.')
  })

  it('drops the queue row once stages arrive', () => {
    const model = deriveConsole(
      [{ type: 'data-queue', data: { position: 2 } }, ...through('ontology', 'running')],
      live,
    )
    expect(model.status).toBe('working')
    expect(model.rows.map((row) => row.title)).not.toContain('Waiting for a free slot, #2 in queue')
  })

  it('puts the running stage on the live row with its latest message', () => {
    const parts = [...through('sim_run', 'running', 'Round 0/2'), stage('sim_run', 'running', 'Round 1/2')]
    const model = deriveConsole(parts, live)
    expect(model.status).toBe('working')
    expect(kinds(model.rows)).toEqual(['done', 'done', 'done', 'done', 'live', 'queued', 'queued'])
    expect(model.rows.map((row) => row.title)).toEqual([
      'Reading your documents',
      'Building the knowledge graph',
      'Creating the simulation',
      'Generating personas',
      'Running the simulation',
      'Writing the report',
      'Done',
    ])
    expect(model.rows[4]).toMatchObject({ detail: 'Round 1 of 2', percent: null })
    expect(model.step).toEqual({ n: 5, total: 7 })
    expect(model.folded).toBe(false)
    expect(model.elapsedSeconds).toBeUndefined()
  })

  it('reports a stage percent when the stage has one', () => {
    const parts: Parts = [{ type: 'data-stage', data: { stage: 'ontology', status: 'running', progress: 40 } }]
    expect(deriveConsole(parts, live).rows[0]?.percent).toBe(40)
  })

  it('counts the interviews stage only when it is present', () => {
    const parts = [...through('sim_run', 'done'), stage('interviews', 'running')]
    const model = deriveConsole(parts, live)
    expect(model.rows).toHaveLength(8)
    expect(model.step).toEqual({ n: 6, total: 8 })
  })

  it('asks for the person while the interview window is open', () => {
    const until = new Date(NOW + 20 * 60_000).toISOString()
    const parts: Parts = [
      ...through('sim_run', 'done'),
      stage('interviews', 'running'),
      { type: 'data-interview_window', id: 'interview_window', data: { until, personaCount: 4, closed: false } },
    ]
    const model = deriveConsole(parts, { ...live, windowLive: true })
    expect(model.status).toBe('needs_you')
    const row = model.rows.find((r) => r.kind === 'live')
    expect(row).toMatchObject({ title: 'Personas online', action: 'window' })
    expect(row?.detail).toMatch(/^4 personas are online until /)
  })

  it('shows the personas offline once the window closed', () => {
    const parts: Parts = [
      ...through('sim_run', 'done'),
      stage('interviews', 'done'),
      {
        type: 'data-interview_window',
        id: 'interview_window',
        data: { until: null, personaCount: 4, closed: true, reason: 'expired' },
      },
    ]
    const model = deriveConsole(parts, { ...live, windowLive: true })
    expect(model.status).toBe('working')
    expect(model.rows[5]).toMatchObject({
      kind: 'done',
      title: 'Personas offline',
      detail: 'The interview window ended',
    })
  })

  it('shows the personas offline when the run ended without closing the window', () => {
    const until = new Date(NOW + 20 * 60_000).toISOString()
    const parts: Parts = [
      { type: 'data-interview_window', id: 'interview_window', data: { until, personaCount: 3, closed: false } },
    ]
    const model = deriveConsole(parts, { ...live, windowLive: false })
    const row = model.rows.find((r) => r.title === 'Personas offline')
    expect(row).toMatchObject({ kind: 'done', detail: 'The run ended' })
    expect(model.status).not.toBe('needs_you')
  })

  it('expands the report row into sections and tool rows', () => {
    const parts: Parts = [
      ...through('report', 'running'),
      {
        type: 'data-report_outline',
        data: {
          title: 'Report',
          sections: [
            { index: 1, title: 'Overview', status: 'done' },
            { index: 2, title: 'Findings', status: 'writing' },
          ],
        },
      },
      {
        type: 'data-report_event',
        data: {
          n: 5,
          action: 'tool_call',
          sectionIndex: 2,
          toolName: 'panorama_search',
          summary: 'Called panorama_search',
          elapsedSeconds: 40,
        },
      },
      {
        type: 'data-report_event',
        data: { n: 1, action: 'section_start', sectionIndex: 1, summary: 'Writing: Overview', elapsedSeconds: 8 },
      },
      {
        type: 'data-report_event',
        data: {
          n: 2,
          action: 'tool_call',
          sectionIndex: 1,
          toolName: 'insight_forge',
          summary: 'Called insight_forge',
          elapsedSeconds: 16,
        },
      },
      {
        type: 'data-report_event',
        data: {
          n: 3,
          action: 'tool_result',
          sectionIndex: 1,
          toolName: 'insight_forge',
          summary: 'Found 12 facts',
          elapsedSeconds: 33,
        },
      },
      {
        type: 'data-report_event',
        data: { n: 4, action: 'section_complete', sectionIndex: 1, summary: 'Finished: Overview', elapsedSeconds: 38 },
      },
    ]
    const model = deriveConsole(parts, live)
    const report = model.rows.find((row) => row.title === 'Writing the report')
    expect(report?.kind).toBe('live')
    expect(report?.detail).toBe('Called panorama_search')
    const [overview, findings] = report?.children ?? []
    expect(overview).toMatchObject({ kind: 'done', title: 'Overview', seconds: 30 })
    expect(overview?.children).toEqual([
      expect.objectContaining({ kind: 'done', chip: 'insight_forge', seconds: 17, detail: 'Found 12 facts' }),
    ])
    expect(findings).toMatchObject({ kind: 'live', title: 'Findings' })
    expect(findings?.children).toEqual([expect.objectContaining({ kind: 'live', chip: 'panorama_search' })])
    expect(findings?.children?.[0]?.seconds).toBeUndefined()
  })

  it('keeps tool events without a section on the report row', () => {
    const parts: Parts = [
      ...through('report', 'running'),
      {
        type: 'data-report_event',
        data: { n: 1, action: 'tool_call', toolName: 'interview_agents', summary: 'Called interview_agents' },
      },
    ]
    const report = deriveConsole(parts, live).rows.find((row) => row.title === 'Writing the report')
    expect(report?.children).toEqual([expect.objectContaining({ kind: 'live', chip: 'interview_agents' })])
  })

  it('folds once the report text arrives', () => {
    const parts: Parts = [...through('finished', 'done'), { type: 'text', text: 'The report' }]
    const model = deriveConsole(parts, live)
    expect(model.folded).toBe(true)
    expect(model.status).toBe('complete')
    expect(model.step).toEqual({ n: 7, total: 7 })
  })

  it('completes when the finished stage is done', () => {
    const model = deriveConsole(through('finished', 'done'), live)
    expect(model.status).toBe('complete')
    expect(model.folded).toBe(false)
    expect(kinds(model.rows).every((kind) => kind === 'done')).toBe(true)
  })

  it('fails on an error with the message and a retry on the failed row', () => {
    const parts: Parts = [
      ...through('sim_prepare', 'failed', 'Persona generation timed out'),
      { type: 'data-error', data: { stage: 'sim_prepare', code: 'timeout', message: 'Persona generation timed out' } },
    ]
    const model = deriveConsole(parts, live)
    expect(model.status).toBe('failed')
    expect(model.rows[3]).toMatchObject({
      kind: 'failed',
      title: 'Generating personas',
      detail: 'Persona generation timed out',
      action: 'retry',
    })
    expect(model.step.n).toBe(4)
  })

  it('marks the stage of an error part as failed even without a failed stage part', () => {
    const parts: Parts = [
      ...through('graph_build', 'running'),
      { type: 'data-error', data: { stage: 'graph_build', code: 'x', message: 'Zep is down' } },
    ]
    const model = deriveConsole(parts, live)
    expect(model.status).toBe('failed')
    expect(model.rows[1]).toMatchObject({ kind: 'failed', detail: 'Zep is down', action: 'retry' })
  })

  it('shows a cancelled run', () => {
    const model = deriveConsole(through('graph_build', 'cancelled', 'Cancelled by the user'), live)
    expect(model.status).toBe('cancelled')
    expect(model.rows[1]).toMatchObject({ kind: 'cancelled', detail: 'Cancelled by the user' })
  })
})
