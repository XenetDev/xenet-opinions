import {
  type ErrorData,
  type InterviewWindowData,
  type OpinionsDataParts,
  type OpinionsUIMessage,
  type ReportEventData,
  type ReportOutlineData,
  STAGES,
  type Stage,
  type StageData,
} from '@xo/engine/parts'

export type ConsoleStatus = 'working' | 'needs_you' | 'complete' | 'failed' | 'cancelled' | 'queued'

export type ConsoleRow = {
  id: string
  kind: 'done' | 'live' | 'queued' | 'failed' | 'cancelled'
  title: string
  detail?: string
  seconds?: number
  chip?: string
  children?: ConsoleRow[]
  percent?: number | null
  action?: 'retry' | 'window'
}

export type ConsoleModel = {
  title?: string
  status: ConsoleStatus
  rows: ConsoleRow[]
  step: { n: number; total: number }
  elapsedSeconds?: number
  folded: boolean
}

export type ConsoleLive = { until?: string | null; windowLive?: boolean }

type Parts = OpinionsUIMessage['parts']

export const STAGE_TITLES: Record<Stage, string> = {
  ontology: 'Reading your documents',
  graph_build: 'Building the knowledge graph',
  sim_create: 'Creating the simulation',
  sim_prepare: 'Generating personas',
  sim_run: 'Running the simulation',
  interviews: 'Personas online',
  report: 'Writing the report',
  finished: 'Done',
}

const OFFLINE_REASONS: Record<NonNullable<InterviewWindowData['reason']>, string> = {
  report_requested: 'Report requested',
  expired: 'The interview window ended',
  environment_stopped: 'The simulation environment stopped',
}

const TOOL_TITLES: Record<string, string> = {
  insight_forge: 'Digging into the simulation',
  panorama_search: 'Searching across the run',
  interview_agents: 'Interviewing personas',
}

function lastData<K extends keyof OpinionsDataParts>(parts: Parts, key: K): OpinionsDataParts[K] | undefined {
  const match = parts.findLast((part) => part.type === `data-${key}`)
  return match && 'data' in match ? (match.data as OpinionsDataParts[K]) : undefined
}

export const clockTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

export function onlineLine(personaCount: number, until: string | null | undefined) {
  const personas =
    personaCount === 0 ? 'Personas are' : personaCount === 1 ? '1 persona is' : `${personaCount} personas are`
  return until ? `${personas} online until ${clockTime(until)}` : `${personas} online`
}

const readable = (message: string) => message.replace(/Round (\d+)\/(\d+)/g, 'Round $1 of $2')

const toolTitle = (tool: string) => TOOL_TITLES[tool] ?? `Called ${tool}`

function reportStepLabel(event: ReportEventData | undefined) {
  if (event?.toolName && (event.action === 'tool_call' || event.action === 'tool_result'))
    return TOOL_TITLES[event.toolName] ?? `Running ${event.toolName}`
  if (event?.sectionTitle) return `Writing ${event.sectionTitle}`
  return 'Planning the report'
}

const delta = (from?: number, to?: number) =>
  from !== undefined && to !== undefined && to >= from ? Math.round(to - from) : undefined

function toolRows(events: ReportEventData[], running: boolean): ConsoleRow[] {
  const rows: ConsoleRow[] = []
  const open: { row: ConsoleRow; started?: number }[] = []
  for (const event of events) {
    const tool = event.toolName ?? 'tool'
    if (event.action === 'tool_call') {
      const row: ConsoleRow = {
        id: `tool:${event.n}`,
        kind: running ? 'live' : 'done',
        title: toolTitle(tool),
        chip: tool,
      }
      rows.push(row)
      open.push({ row, started: event.elapsedSeconds })
    } else if (event.action === 'tool_result') {
      const index = open.findIndex((entry) => entry.row.chip === tool)
      const entry = index >= 0 ? open.splice(index, 1)[0] : undefined
      const row = entry?.row ?? { id: `tool:${event.n}`, kind: 'done', title: toolTitle(tool), chip: tool }
      if (!entry) rows.push(row)
      row.kind = 'done'
      const seconds = delta(entry?.started, event.elapsedSeconds)
      if (seconds !== undefined) row.seconds = seconds
    }
  }
  return rows
}

function reportChildren(outline: ReportOutlineData | undefined, events: ReportEventData[], running: boolean) {
  const unsectioned = toolRows(
    events.filter((event) => event.sectionIndex === undefined),
    running,
  )
  const sections = (outline?.sections ?? []).map((section): ConsoleRow => {
    const own = events.filter((event) => event.sectionIndex === section.index)
    const start = own.find((event) => event.action === 'section_start')?.elapsedSeconds
    const end = own.find((event) => event.action === 'section_complete')?.elapsedSeconds
    const seconds = section.status === 'done' ? delta(start, end) : undefined
    const children = toolRows(own, running && section.status === 'writing')
    return {
      id: `section:${section.index}`,
      kind: section.status === 'done' ? 'done' : section.status === 'writing' && running ? 'live' : 'queued',
      title: section.title,
      ...(seconds !== undefined ? { seconds } : {}),
      ...(children.length > 0 ? { children } : {}),
    }
  })
  return [...unsectioned, ...sections]
}

function stageRow(
  stage: Stage,
  data: StageData | undefined,
  error: ErrorData | undefined,
  window: InterviewWindowData | undefined,
  live: ConsoleLive,
): ConsoleRow {
  const id = `stage:${stage}`
  const title = STAGE_TITLES[stage]
  const message = data?.message === title ? undefined : data?.message
  if (error || data?.status === 'failed') {
    return { id, kind: 'failed', title, detail: message ?? error?.message, action: 'retry' }
  }
  if (data?.status === 'cancelled') return { id, kind: 'cancelled', title, ...(message ? { detail: message } : {}) }
  if (stage === 'interviews' && window) {
    const open = !window.closed && live.windowLive !== false
    if (open) {
      return {
        id,
        kind: 'live',
        title,
        detail: onlineLine(window.personaCount, live.until ?? window.until),
        percent: null,
        action: 'window',
      }
    }
    const reason = window.closed ? window.reason && OFFLINE_REASONS[window.reason] : 'The run ended'
    return { id, kind: 'done', title: 'Personas offline', ...(reason ? { detail: reason } : {}) }
  }
  if (stage === 'interviews' && data?.status === 'done') return { id, kind: 'done', title: 'Personas offline' }
  if (data?.status === 'done') return { id, kind: 'done', title }
  if (data?.status === 'running') {
    return {
      id,
      kind: 'live',
      title,
      ...(message ? { detail: readable(message) } : {}),
      percent: data.progress ?? null,
    }
  }
  return { id, kind: 'queued', title }
}

export function deriveConsole(parts: Parts, live: ConsoleLive): ConsoleModel {
  const byStage = new Map<Stage, StageData>()
  for (const part of parts) if (part.type === 'data-stage') byStage.set(part.data.stage, part.data)
  const errors = new Map<Stage, ErrorData>()
  for (const part of parts) if (part.type === 'data-error') errors.set(part.data.stage, part.data)
  const queue = lastData(parts, 'queue')
  const window = lastData(parts, 'interview_window')
  const outline = lastData(parts, 'report_outline')
  const events = parts
    .flatMap((part) => (part.type === 'data-report_event' ? [part.data] : []))
    .sort((a, b) => a.n - b.n)
  const folded = parts.some((part) => part.type === 'text')

  if (byStage.size === 0 && errors.size === 0 && !window && queue && queue.position >= 1) {
    return {
      status: 'queued',
      rows: [
        {
          id: 'queue',
          kind: 'queued',
          title: `Waiting for a free slot, #${queue.position} in queue`,
          ...(queue.pausedAhead ? { detail: 'A run is paused for interviews; yours starts when it finishes.' } : {}),
        },
      ],
      step: { n: 0, total: STAGES.length - 1 },
      folded,
    }
  }

  const shown = STAGES.filter((stage) => stage !== 'interviews' || byStage.has(stage) || window)
  const rows = shown.map((stage) => {
    const row = stageRow(stage, byStage.get(stage), errors.get(stage), window, live)
    if (stage === 'report' && (outline || events.length > 0)) {
      const children = reportChildren(outline, events, row.kind === 'live')
      if (children.length > 0) row.children = children
      if (row.kind === 'live' && !row.detail) row.detail = reportStepLabel(events.at(-1))
      const last = events.findLast((event) => event.elapsedSeconds !== undefined)?.elapsedSeconds
      if (row.kind === 'done' && last !== undefined) row.seconds = Math.round(last)
    }
    return row
  })

  for (const [stage, error] of errors) {
    if (shown.includes(stage)) continue
    const stopped = rows.find((row) => row.kind !== 'done')
    if (stopped) Object.assign(stopped, { kind: 'failed', detail: error.message, action: 'retry' })
    else
      rows.push({ id: `error:${stage}`, kind: 'failed', title: 'Run failed', detail: error.message, action: 'retry' })
  }

  const status: ConsoleStatus = rows.some((row) => row.kind === 'failed')
    ? 'failed'
    : rows.some((row) => row.kind === 'cancelled')
      ? 'cancelled'
      : byStage.get('finished')?.status === 'done'
        ? 'complete'
        : rows.some((row) => row.action === 'window')
          ? 'needs_you'
          : 'working'

  const current = rows.findIndex((row) => row.kind === 'live')
  const pending = rows.findIndex((row) => row.kind !== 'done')
  const n = current >= 0 ? current + 1 : pending >= 0 ? pending + 1 : rows.length

  return { status, rows, step: { n, total: rows.length }, folded }
}

export function liveStepLabel(parts: Parts): string | undefined {
  const model = deriveConsole(parts, {})
  return model.status === 'queued' ? model.rows[0]?.title : model.rows.find((row) => row.kind === 'live')?.title
}
