import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Platform } from '../src/schemas/common'

const read = (url: string) => readFileSync(fileURLToPath(new URL(url, import.meta.url)), 'utf8')
const fixture = <T>(name: string): T => (JSON.parse(read(`../src/fixtures/${name}.json`)) as { data: T }).data

export const ontologyFixture = fixture<Record<string, unknown>>('graph.ontology.generate')
export const agentLogFixture = fixture<{ logs: Array<Record<string, unknown>> }>('report.agent-log.mock').logs
export const reportMarkdown = read('./report.md')

const GRAPH_TYPES: Record<string, string[]> = {
  Organization: [
    'Riverton City Council',
    'ZipRide',
    'Volt',
    'Riverton Chamber of Commerce',
    'Riverton Polytechnic',
    'Riverton General Hospital',
    'Public Consultation Office',
    'Riverton Transit Authority',
  ],
  Person: [
    'Maria Delgado',
    'Helen Okafor',
    'Tom Reyes',
    'Priya Nair',
    'Grace Whitfield',
    'Omar Haddad',
    'Noah Ortiz',
    'Liam Walker',
    'Aisha Khan',
    'Lucas Brandt',
    'Hannah Meyer',
    'Ethan Kim',
  ],
  Group: [
    "Riverton Seniors' Association",
    'Disability Advocates',
    'Students Union',
    'Cafe Owners Collective',
    'Northern District Shops',
    'Cycling Campaign',
    'Parents Association',
    'Night-shift Workers',
  ],
  Topic: [
    'E-scooter ban',
    'Pavement safety',
    'Late-night transport',
    'Parking bays',
    'Speed limit',
    'Injury statistics',
    'Public hearing',
    'Rental pricing',
  ],
  Place: [
    'Downtown Riverton',
    'Industrial park',
    'Riverfront',
    'Northern district',
    'Polytechnic campus',
    'Market square',
  ],
  Media: ['Riverton Herald', 'Local radio', 'Community forum', 'Council newsletter'],
}
const RELATIONS = [
  'SUPPORTS',
  'OPPOSES',
  'REPRESENTS',
  'OPERATES_IN',
  'REPORTED_BY',
  'MEMBER_OF',
  'PROPOSED',
  'AFFECTS',
]

export const buildGraphData = () => {
  const nodes: { uuid: string; name: string; labels: string[]; type: string }[] = []
  for (const [type, names] of Object.entries(GRAPH_TYPES))
    for (const name of names) nodes.push({ uuid: `node_${nodes.length}`, name, labels: ['Entity', type], type })
  while (nodes.length < 80) {
    const i = nodes.length
    const type = i % 2 ? 'Person' : 'Topic'
    nodes.push({ uuid: `node_${i}`, name: `${type} ${i}`, labels: ['Entity', type], type })
  }
  const hubs = [0, 1, 20, 28, 8, 29, 2, 21]
  const seen = new Set<string>()
  const edges: { uuid: string; source_node_uuid: string; target_node_uuid: string; name: string }[] = []
  const add = (a: number, b: number) => {
    if (a === b || edges.length >= 124) return
    const key = a < b ? `${a}-${b}` : `${b}-${a}`
    if (seen.has(key)) return
    seen.add(key)
    edges.push({
      uuid: `edge_${edges.length}`,
      source_node_uuid: `node_${a}`,
      target_node_uuid: `node_${b}`,
      name: RELATIONS[(a * 3 + b) % RELATIONS.length] ?? 'RELATED',
    })
  }
  for (let i = 0; i < 80; i++) add(i, hubs[(i * 5 + 3) % hubs.length] ?? 0)
  for (let i = 0; i < 80; i += 3) add(i, (i * 11 + 7) % 80)
  for (let i = 0; i < hubs.length; i++) add(hubs[i] ?? 0, hubs[(i + 1) % hubs.length] ?? 0)
  for (let i = 1; edges.length < 124; i++) add((i * 13) % 80, (i * 29 + 5) % 80)
  return { nodes: nodes.map(({ type: _type, ...node }) => node), edges }
}

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

const POST_TEXT: Record<Platform, string[]> = {
  twitter: [
    'A 20% increase with no warning is hard to justify.',
    'Still better value than the alternatives, honestly.',
    'Comparing competitors before the next renewal.',
    'Will annual plans keep the old price?',
  ],
  reddit: [
    'Got the price-rise email this morning. 20% with a month of notice is a lot for a tool we rely on daily.',
    'Unpopular opinion: it is still cheaper than switching, once you count the migration time.',
    'Anyone built a comparison sheet of the alternatives? Happy to share mine if there is interest.',
    'Question for people on annual plans: did your renewal quote go up too?',
  ],
}

const postAuthor = (platform: Platform, round: number, k: number) =>
  (round * 2 + k + (platform === 'reddit' ? 5 : 0)) % PROFILE_COUNT

export const buildPost = (platform: Platform, round: number, k: number) => ({
  post_id: `${platform}_${round}_${k}`,
  user_id: postAuthor(platform, round, k),
  agent_name: buildProfile(postAuthor(platform, round, k)).name,
  content: POST_TEXT[platform][(round + k) % POST_TEXT[platform].length] as string,
  round,
  platform,
})

const REPLY_TEXT: Record<Platform, string[]> = {
  twitter: [
    'Agreed, the timing makes it worse.',
    'I see it differently, the product still earns it.',
    'Has anyone actually priced the alternatives?',
    'This is exactly why I switched to annual.',
    'Fair point, but support has been slipping too.',
  ],
  reddit: [
    'Same here. The notice period is the real problem, not the number.',
    'We ran the numbers last quarter and the next best option was within 10%, so we stayed.',
    'Mine went up as well, but they honoured the old price until the term ended.',
    'Worth asking your account manager. Ours gave a discount once we mentioned the competitors.',
    'The product is fine, but the support queue has doubled since the last release.',
  ],
}

export const buildComments = (platform: Platform, round: number, k: number) =>
  [0, 1].map((j) => ({
    comment_id: `${platform}_${round}_${k}_c${j}`,
    post_id: `${platform}_${round}_${k}`,
    user_id: (postAuthor(platform, round, k) + 3 + j) % PROFILE_COUNT,
    content: REPLY_TEXT[platform][(round + k + j) % REPLY_TEXT[platform].length] as string,
    created_at: round,
  }))
