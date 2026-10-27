import type {
  AgentLogLine,
  GraphData as MfGraphData,
  OntologyResult,
  Platform,
  ProfilesRealtime,
  RunStatus,
} from '@xo/mirofish'
import type { AgentsData, GraphData, OntologyData, ReportEventData, ReportOutlineData, SimFeedData } from '../parts'

type Rec = Record<string, unknown>
type FeedPost = SimFeedData['posts'][number]

const MAX_NODES = 200
const MAX_POSTS = 50
const RESULT_SUMMARY_CHARS = 160

const rec = (v: unknown): Rec => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {})
const str = (...vs: unknown[]): string | undefined => {
  for (const v of vs) {
    if (typeof v === 'string' && v) return v
    if (typeof v === 'number') return String(v)
  }
  return undefined
}
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const names = (v: unknown) => list(v).flatMap((t) => str(t, rec(t).name) ?? [])

export const ontologyToPart = (result: OntologyResult): OntologyData => {
  const o = rec(result.ontology)
  return {
    entityTypes: names(o.entity_types),
    relationTypes: names(o.edge_types ?? o.relation_types),
    ...(result.analysis_summary ? { summary: result.analysis_summary } : {}),
  }
}

export const graphDataToPart = (graphId: string, data: MfGraphData): GraphData => {
  const nodes = data.nodes.flatMap((raw) => {
    const n = rec(raw)
    const id = str(n.uuid, n.id)
    if (!id) return []
    const type = str(
      list(n.labels).find((l) => l !== 'Entity'),
      n.type,
    )
    return [{ id, label: str(n.name, n.label) ?? id, ...(type ? { type } : {}) }]
  })
  const sampled = nodes.slice(0, MAX_NODES)
  const keep = new Set(sampled.map((n) => n.id))
  const links = data.edges.flatMap((raw) => {
    const e = rec(raw)
    const source = str(e.source_node_uuid, e.source)
    const target = str(e.target_node_uuid, e.target)
    if (!source || !target || !keep.has(source) || !keep.has(target)) return []
    const label = str(e.name, e.fact_type, e.label)
    return [{ source, target, ...(label ? { label } : {}) }]
  })
  return { graphId, nodeCount: data.nodes.length, edgeCount: data.edges.length, nodes: sampled, links }
}

export const profilesToPart = (realtime: ProfilesRealtime): AgentsData => {
  const profiles = realtime.profiles.map((raw, i) => {
    const p = rec(raw)
    const handle = str(p.handle, p.username)
    const role = str(p.role, p.profession)
    const bio = str(p.bio, p.persona)
    return {
      id: str(p.agent_id, p.user_id, p.id) ?? String(i),
      name: str(p.name, p.realname, p.username) ?? `Agent ${i + 1}`,
      ...(handle ? { handle } : {}),
      ...(role ? { role } : {}),
      ...(bio ? { bio } : {}),
      topics: list(p.topics ?? p.interested_topics).filter((t): t is string => typeof t === 'string'),
    }
  })
  const expected = num(realtime.total_expected)
  return { count: profiles.length, ...(expected !== undefined ? { expected } : {}), profiles }
}

export const configToPlatform = (raw: unknown): Platform => {
  const config = rec(rec(raw).config)
  const enabled = (['twitter', 'reddit'] as const).find((p) => config[`${p}_config`])
  return enabled ?? 'reddit'
}

export const rawPosts = (res: unknown): unknown[] => (Array.isArray(res) ? res : list(rec(res).posts))

export const postsToFeed = (res: unknown, platform: Platform): FeedPost[] =>
  rawPosts(res).map((raw, i) => {
    const p = rec(raw)
    return {
      id: str(p.post_id, p.id) ?? `${platform}_${i}`,
      platform,
      agent: str(p.agent_name, p.user_name, p.name, p.agent_id, p.user_id) ?? 'Agent',
      content: str(p.content, p.text) ?? '',
      round: num(p.round) ?? 0,
    }
  })

export const runStatusToFeed = (
  prev: SimFeedData | undefined,
  status: RunStatus,
  newPosts: FeedPost[],
): SimFeedData => {
  const s = status as RunStatus & Rec
  const added = (platform: Platform) => newPosts.filter((p) => p.platform === platform).length
  return {
    round: num(s.current_round) ?? prev?.round ?? 0,
    totalRounds: num(s.total_rounds) ?? prev?.totalRounds ?? 0,
    twitterActs: num(s.twitter_actions_count) ?? (prev?.twitterActs ?? 0) + added('twitter'),
    redditActs: num(s.reddit_actions_count) ?? (prev?.redditActs ?? 0) + added('reddit'),
    posts: [...(prev?.posts ?? []), ...newPosts].sort((a, b) => a.round - b.round).slice(-MAX_POSTS),
  }
}

type Section = ReportOutlineData['sections'][number]

const upsertSection = (sections: Section[], index: number, title: string | undefined, status: Section['status']) => {
  const existing = sections.find((s) => s.index === index)
  if (existing) return sections.map((s) => (s === existing ? { ...s, status, title: title ?? s.title } : s))
  return [...sections, { index, title: title ?? `Section ${index}`, status }].sort((a, b) => a.index - b.index)
}

const summarise = (line: AgentLogLine, outline: ReportOutlineData | undefined): string | undefined => {
  const d = rec(line.details)
  const tool = str(d.tool_name) ?? 'tool'
  switch (line.action) {
    case 'planning_complete':
      return `Outline ready (${outline?.sections.length ?? 0} sections)`
    case 'section_start':
      return `Writing: ${line.section_title ?? 'section'}`
    case 'tool_call':
      return `Called ${tool}`
    case 'tool_result':
      return typeof d.result === 'string' && d.result ? d.result.slice(0, RESULT_SUMMARY_CHARS) : `${tool} returned`
    case 'llm_response':
      return `Thinking (iteration ${num(d.iteration) ?? 1})`
    case 'section_complete':
      return `Finished: ${line.section_title ?? 'section'}`
    case 'report_complete':
      return 'Report complete'
    case 'error':
      return (str(d.error, d.message) ?? 'Error').split('\n')[0]?.slice(0, RESULT_SUMMARY_CHARS) ?? 'Error'
    default:
      return undefined
  }
}

const nextOutline = (line: AgentLogLine, outline: ReportOutlineData | undefined): ReportOutlineData | undefined => {
  const d = rec(line.details)
  switch (line.action) {
    case 'planning_complete': {
      const o = rec(d.outline)
      const sections = list(o.sections).map((s, i) => ({
        index: i + 1,
        title: str(rec(s).title, s) ?? `Section ${i + 1}`,
        status: 'pending' as const,
      }))
      const title = str(o.title)
      return { ...(title ? { title } : {}), sections }
    }
    case 'section_start':
    case 'section_complete': {
      if (line.section_index == null) return outline
      const status = line.action === 'section_start' ? 'writing' : 'done'
      return {
        ...outline,
        sections: upsertSection(outline?.sections ?? [], line.section_index, line.section_title ?? undefined, status),
      }
    }
    case 'report_complete':
      return outline && { ...outline, sections: outline.sections.map((s) => ({ ...s, status: 'done' as const })) }
    default:
      return outline
  }
}

export const agentLogToEvents = (
  lines: AgentLogLine[],
  startN: number,
  prev?: ReportOutlineData,
): { outline?: ReportOutlineData; events: ReportEventData[]; complete: boolean } => {
  let outline = prev
  let complete = false
  const events: ReportEventData[] = []
  for (const line of lines) {
    outline = nextOutline(line, outline)
    if (line.action === 'report_complete') complete = true
    const summary = summarise(line, outline)
    if (summary === undefined) continue
    const toolName = str(rec(line.details).tool_name)
    events.push({
      n: startN + events.length,
      action: line.action,
      ...(line.section_index != null ? { sectionIndex: line.section_index } : {}),
      ...(line.section_title ? { sectionTitle: line.section_title } : {}),
      ...(toolName ? { toolName } : {}),
      summary,
      ...(line.elapsed_seconds !== undefined ? { elapsedSeconds: line.elapsed_seconds } : {}),
    })
  }
  const changed = JSON.stringify(outline) !== JSON.stringify(prev)
  return { ...(changed && outline ? { outline } : {}), events, complete }
}
