import type { Run, RunEvent } from '@xo/db'
import type { generateText, LanguageModel } from 'ai'
import { partIdFor, ReportTextDataSchema, type RunEventInput } from '../events'
import { AgentsDataSchema, DebriefDataSchema, type SimFeedData, SimFeedDataSchema } from '../parts'
import { PANEL_GROUPS } from '../policy/panel'
import { FenceError, type RunStore } from '../store/types'
import { aggregate } from './aggregate'
import { classify, fixGroups, type Persona, verbatim } from './classify'
import { generateNarrative } from './generate'
import { type ReportSummary, ReportSummarySchema } from './schema'
import { cleanWriteup } from './writeup'

export const SUMMARY_BUDGET_MS = 240_000
export const NOT_CONFIGURED = 'Summary model not configured'
const NO_PARTICIPANTS = 'No participants to summarise'

export type SummaryDeps = {
  store: RunStore
  summaryModel?: LanguageModel
  log?(msg: string, meta?: Record<string, unknown>): void
  generate?: typeof generateText
}

class SummaryError extends Error {}

const latest = <T>(events: RunEvent[], kind: string, parse: (payload: unknown) => T | undefined) => {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i]!.kind !== kind) continue
    const data = parse(events[i]!.payload)
    if (data !== undefined) return data
  }
  return undefined
}

const feedItems = (events: RunEvent[]) => {
  const items = new Map<string, { agent: string; content: string }>()
  let last: SimFeedData | undefined
  for (const e of events) {
    if (e.kind !== 'sim_feed') continue
    const feed = SimFeedDataSchema.safeParse(e.payload).data
    if (!feed) continue
    last = feed
    for (const p of feed.posts) items.set(`post:${p.platform}:${p.id}`, p)
    for (const r of feed.replies ?? []) items.set(`reply:${r.platform}:${r.id}`, r)
  }
  return { items: [...items.values()], last }
}

export type SummaryOptions = { signal: AbortSignal; requireRunning?: boolean }

const ensureRunning = async (run: Run, store: RunStore) => {
  const current = await store.get(run.id)
  if (current?.status !== 'running') throw new FenceError(run.id)
}

const authorOf = (profiles: Array<{ id: string; name: string }>) => {
  const ids = new Set(profiles.map((p) => p.id))
  const names = new Map<string, string | null>()
  for (const p of profiles) names.set(p.name, names.has(p.name) ? null : p.id)
  return (agent: string) => (ids.has(agent) ? agent : (names.get(agent) ?? undefined))
}

async function summaryGroups(
  run: Run,
  personas: Persona[],
  model: LanguageModel,
  deps: SummaryDeps,
  opts: SummaryOptions,
): Promise<string[]> {
  const configured = run.config.panel?.groups ?? []
  const labels = PANEL_GROUPS.filter((g) => (configured as string[]).includes(g.id)).map((g) => g.label)
  if (labels.length) return labels
  const cast = run.config.panel?.castGroups ?? []
  if (cast.length) return cast
  const fixed = await fixGroups(personas, {
    model,
    abortSignal: opts.signal,
    ...(deps.generate ? { generate: deps.generate } : {}),
  }).catch((error) => {
    if (opts.signal.aborted) throw error
    deps.log?.('summary groups pre-pass failed', { runId: run.id, error })
    return []
  })
  if (opts.requireRunning) await ensureRunning(run, deps.store)
  return fixed
}

export async function runSummary(run: Run, deps: SummaryDeps, opts: SummaryOptions): Promise<ReportSummary> {
  const model = deps.summaryModel
  if (!model) throw new SummaryError(NOT_CONFIGURED)
  const events = await deps.store.listEvents(run.id, 0)
  const agents = latest(events, 'agents', (p) => AgentsDataSchema.safeParse(p).data)
  if (!agents?.profiles.length) throw new SummaryError(NO_PARTICIPANTS)
  const debrief = latest(events, 'debrief', (p) => DebriefDataSchema.safeParse(p).data)
  const markdown = latest(events, 'report_text', (p) => ReportTextDataSchema.safeParse(p).data)?.markdown ?? ''
  const feed = feedItems(events)

  const author = authorOf(agents.profiles)
  const personas: Persona[] = agents.profiles.map((profile) => {
    const answer = debrief?.answers.find((a) => a.agentId === profile.id && a.status === 'done')?.answer
    const said = feed.items.filter((item) => author(item.agent) === profile.id).map((item) => item.content)
    return {
      agentId: profile.id,
      name: profile.name,
      profile: [profile.role, profile.bio].filter(Boolean).join('. '),
      texts: [...(answer?.trim() ? [answer] : []), ...said].filter((text) => text.trim()),
    }
  })

  const groups = await summaryGroups(run, personas, model, deps, opts)
  const classified = await classify(personas, {
    model,
    abortSignal: opts.signal,
    ...(groups.length ? { groups } : {}),
    ...(deps.generate ? { generate: deps.generate } : {}),
    ...(opts.requireRunning ? { beforeBatch: () => ensureRunning(run, deps.store) } : {}),
    onBatchError: (error) => deps.log?.('summary classify batch failed', { runId: run.id, error }),
  })
  if (opts.requireRunning) await ensureRunning(run, deps.store)
  const aggregates = aggregate(classified)
  const writeup = cleanWriteup(markdown)
  const narrative = await generateNarrative({
    model,
    abortSignal: opts.signal,
    question: run.config.requirement,
    aggregates,
    classified,
    writeup,
    ...(deps.generate ? { generate: deps.generate } : {}),
  })
  const research = run.config.researchId ? await deps.store.getResearch(run.config.researchId) : null
  const summaries = new Map(narrative.groups.map((g) => [g.id, g.summary.trim()]))

  return ReportSummarySchema.parse({
    verdict: narrative.verdict.trim(),
    confidence: { level: narrative.confidence.level, reason: narrative.confidence.reason.trim() },
    headline: aggregates.headline,
    split: aggregates.split,
    groups: aggregates.groups.map((g) => ({ ...g, summary: summaries.get(g.id) ?? '' })),
    findings: narrative.findings.map((f) => {
      const author = f.quote && personas.find((p) => verbatim(f.quote!.text, p.texts))
      const text = author && verbatim(f.quote!.text, author.texts)
      return {
        title: f.title.trim(),
        detail: f.detail.trim(),
        ...(author && text ? { quote: { text, name: author.name } } : {}),
      }
    }),
    risks: narrative.risks.map((r) => r.trim()).filter(Boolean),
    opportunities: narrative.opportunities.map((o) => o.trim()).filter(Boolean),
    participants: classified.map((c) => ({
      agentId: c.agentId,
      name: c.name,
      ...(c.age !== undefined ? { age: c.age } : {}),
      ...(c.role ? { role: c.role } : {}),
      ...(c.location ? { location: c.location } : {}),
      group: c.groupId,
      kind: c.kind,
      sentiment: c.sentiment,
      action: c.action,
      opinion: c.opinion,
      ...(c.quote ? { quote: c.quote } : {}),
    })),
    sources: (research?.sources ?? []).map((s) => ({ title: s.title, url: s.url })),
    method: {
      participants: classified.length,
      groups: aggregates.groups.length,
      rounds: feed.last?.round || run.config.maxRounds,
      webResearch: Boolean(research),
    },
    writeup,
  })
}

const failureMessage = (err: unknown) => {
  if (err instanceof SummaryError) return err.message
  if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError'))
    return 'The summary took too long'
  return 'The summary could not be written'
}

export async function summaryEvent(run: Run, deps: SummaryDeps, opts: SummaryOptions): Promise<RunEventInput> {
  try {
    const summary = await runSummary(run, deps, opts)
    return { kind: 'report_summary', partId: partIdFor('report_summary', summary), payload: summary }
  } catch (err) {
    if (err instanceof FenceError) throw err
    deps.log?.('report summary failed', { runId: run.id, error: err })
    const payload = { message: failureMessage(err) }
    return { kind: 'report_summary_failed', partId: partIdFor('report_summary_failed', payload), payload }
  }
}
