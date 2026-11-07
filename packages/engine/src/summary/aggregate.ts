import type { Action, Headline, Kind, Split, SummaryGroup } from './schema'

export type Classified = {
  agentId: string
  name: string
  age?: number
  role?: string
  location?: string
  groupId: string
  groupLabel: string
  kind: Kind
  sentiment: number | null
  action: Action
  opinion: string
  concern: string | null
  quote?: string
}

export type Aggregates = { headline: Headline; split: Split; groups: Omit<SummaryGroup, 'summary'>[] }

const round = (value: number, places: number) => Math.round(value * 10 ** places) / 10 ** places

const average = (members: Classified[]) => {
  const scores = members.flatMap((m) => (m.sentiment === null ? [] : [m.sentiment]))
  return scores.length ? round(scores.reduce((a, b) => a + b, 0) / scores.length, 1) : null
}

const countable = (members: Classified[]) =>
  members.filter(
    (m) =>
      m.kind === 'person' &&
      m.sentiment !== null &&
      (m.action === 'act' || m.action === 'not_act' || m.action === 'unsure'),
  )

const countOf = (counted: Classified[], action: Action) => counted.filter((m) => m.action === action).length

const shareOf = (counted: Classified[], action: Action) =>
  counted.length ? round(countOf(counted, action) / counted.length, 2) : null

const normaliseConcern = (concern: string) => concern.trim().replace(/\s+/g, ' ').toLowerCase()

const topConcern = (members: Classified[]): Headline['topConcern'] => {
  const counts = new Map<string, { label: string; count: number }>()
  for (const m of members) {
    if (m.sentiment === null || !m.concern?.trim()) continue
    const key = normaliseConcern(m.concern)
    const entry = counts.get(key) ?? { label: key, count: 0 }
    entry.count++
    counts.set(key, entry)
  }
  let best: Headline['topConcern'] = null
  for (const entry of counts.values()) if (!best || entry.count > best.count) best = entry
  return best
}

export function aggregate(classified: Classified[]): Aggregates {
  const split: Split = { positive: 0, neutral: 0, negative: 0 }
  for (const m of classified) {
    if (m.sentiment === null) continue
    if (m.sentiment > 0) split.positive++
    else if (m.sentiment < 0) split.negative++
    else split.neutral++
  }
  const byGroup = new Map<string, Classified[]>()
  for (const m of classified) byGroup.set(m.groupId, [...(byGroup.get(m.groupId) ?? []), m])
  const groups = [...byGroup.entries()].map(([id, members]) => {
    const counted = countable(members)
    return {
      id,
      label: members[0]!.groupLabel,
      people: members.length,
      sentiment: average(members),
      actShare: shareOf(counted, 'act'),
      counted: counted.length,
      actCount: countOf(counted, 'act'),
    }
  })
  const counted = countable(classified)
  return {
    headline: {
      sentiment: average(classified),
      actShare: shareOf(counted, 'act'),
      switchShare: shareOf(counted, 'not_act'),
      topConcern: topConcern(classified),
      counted: counted.length,
      actCount: countOf(counted, 'act'),
      switchCount: countOf(counted, 'not_act'),
    },
    split,
    groups,
  }
}
