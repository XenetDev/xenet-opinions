import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Platform } from '../src/schemas/common'

const read = (url: string) => readFileSync(fileURLToPath(new URL(url, import.meta.url)), 'utf8')
const fixture = <T>(name: string): T => (JSON.parse(read(`../src/fixtures/${name}.json`)) as { data: T }).data

export const ontologyFixture = fixture<Record<string, unknown>>('graph.ontology.generate')
export const agentLogFixture = fixture<{ logs: Array<Record<string, unknown>> }>('report.agent-log.mock').logs
export const reportMarkdown = read('./report.md')

const ENTITY_TYPES = ['Customer', 'Competitor', 'Analyst', 'Channel']

export const buildGraphData = () => ({
  nodes: Array.from({ length: 80 }, (_, i) => ({
    uuid: `node_${i}`,
    name: `${ENTITY_TYPES[i % ENTITY_TYPES.length]} ${i}`,
    labels: [ENTITY_TYPES[i % ENTITY_TYPES.length]],
  })),
  edges: Array.from({ length: 124 }, (_, j) => {
    const source = j % 80
    let target = (j * 7 + 13) % 80
    if (target === source) target = (target + 1) % 80
    return {
      uuid: `edge_${j}`,
      source_node_uuid: `node_${source}`,
      target_node_uuid: `node_${target}`,
      name: j % 2 === 0 ? 'INFLUENCES' : 'SWITCHES_TO',
    }
  }),
})

export const PROFILE_COUNT = 12

const FIRST = ['Maya', 'Liam', 'Priya', 'Noah', 'Sofia', 'Omar', 'Chloe', 'Ethan', 'Aisha', 'Lucas', 'Hannah', 'Diego']
const LAST = [
  'Chen',
  'Walker',
  'Patel',
  'Ortiz',
  'Novak',
  'Haddad',
  'Dubois',
  'Kim',
  'Bello',
  'Silva',
  'Meyer',
  'Reyes',
]
const ROLES = [
  'Small team lead',
  'Freelancer',
  'Procurement manager',
  'Industry analyst',
  'Startup founder',
  'Power user',
]
const TOPICS = ['pricing', 'churn', 'alternatives', 'support', 'roadmap', 'contracts', 'value']

export const buildProfile = (i: number) => {
  const name = `${FIRST[i % FIRST.length]} ${LAST[i % LAST.length]}`
  const role = ROLES[i % ROLES.length] as string
  return {
    agent_id: i,
    name,
    handle: `${name.toLowerCase().replace(' ', '_')}${i}`,
    role,
    bio: `${role} following the price change closely.`,
    topics: [TOPICS[i % TOPICS.length] as string, TOPICS[(i + 3) % TOPICS.length] as string],
  }
}

const POST_TEXT = [
  'A 20% increase with no warning is hard to justify.',
  'Still better value than the alternatives, honestly.',
  'Comparing competitors before the next renewal.',
  'Will annual plans keep the old price?',
]

export const buildPost = (platform: Platform, round: number, k: number) => ({
  post_id: `${platform}_${round}_${k}`,
  agent_name: buildProfile((round * 2 + k + (platform === 'reddit' ? 5 : 0)) % PROFILE_COUNT).name,
  content: POST_TEXT[(round + k) % POST_TEXT.length] as string,
  round,
  platform,
})
