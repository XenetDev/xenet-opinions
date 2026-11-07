export const SEED_PROMPT_MIN_WORDS = 40
export const SEED_FIELD_MAX = 2000
export const SEED_ACTORS_MAX = 12_000

export const CAST_CHARS_PER_PARTICIPANT = 300
export const CAST_GROUPS_MAX = 12

const castLines = (actors: string) => actors.split(/\r?\n/).map((line) => line.trim())

export const CAST_GROUP_LABEL_MAX = 60

const groupHeading = (line: string) => {
  const bare = line.replace(/^[-#*_\s]+|[*_\s]+$/g, '')
  return bare.endsWith(':')
    ? bare
        .slice(0, -1)
        .replace(/[*_<>]/g, '')
        .trim()
        .slice(0, CAST_GROUP_LABEL_MAX)
    : null
}

export const castPeople = (actors: string) =>
  castLines(actors).filter((line) => line.startsWith('- ') && groupHeading(line) === null).length

export function castGroups(actors: string): string[] {
  const groups: string[] = []
  for (const line of castLines(actors)) {
    if (line.startsWith('-') && !line.endsWith(':') && !line.endsWith(':**')) continue
    const label = groupHeading(line)
    if (label && !groups.includes(label)) groups.push(label)
    if (groups.length === CAST_GROUPS_MAX) break
  }
  return groups
}

export const castSlack = (maxParticipants: number) => Math.max(2, Math.ceil(maxParticipants * 0.1))

export const castCharsMax = (maxParticipants: number) =>
  Math.min(SEED_ACTORS_MAX, maxParticipants * CAST_CHARS_PER_PARTICIPANT)

export function castWithinPlan(actors: string | undefined, maxParticipants: number): boolean {
  if (!actors) return true
  if (actors.length > castCharsMax(maxParticipants)) return false
  return castPeople(actors) <= maxParticipants + castSlack(maxParticipants)
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}

export function needsSeedContext(text: string, uploadCount: number): boolean {
  return uploadCount === 0 && wordCount(text) < SEED_PROMPT_MIN_WORDS
}

const DEFAULT_BACKGROUND =
  "A present-day, realistic setting for the question above. The people and organisations involved already exist, know each other's positions, and talk about the decision in public."

const DEFAULT_ACTORS = [
  '- The people directly affected by the decision, across different ages, budgets and levels of dependence on what is changing',
  '- The organisation or authority making the decision, including its leadership and front-line staff',
  '- Organisations with a competing or opposing interest',
  '- Journalists, analysts and commentators who cover the topic',
  '- Online communities and social media where the decision is discussed',
].join('\n')

const DEFAULT_CHANGE =
  'The decision described in the question is announced publicly and takes effect within the next month.'

export function buildSeedDocument(input: {
  question: string
  background?: string
  actors?: string
  change?: string
}): string {
  const section = (value: string | undefined, fallback: string) => value?.trim() || fallback
  return [
    '# Scenario',
    '',
    input.question.trim(),
    '',
    '## Background and constraints',
    section(input.background, DEFAULT_BACKGROUND),
    '',
    '## Who is involved',
    section(input.actors, DEFAULT_ACTORS),
    '',
    '## What is changing',
    section(input.change, DEFAULT_CHANGE),
    '',
  ].join('\n')
}

export const CAST_GUIDANCE =
  'Who to simulate: the people and organisations whose reactions answer this question, such as customers, investors, staff, partners, competitors, regulators, journalists and online communities. Create personas only for individual people and real, named organisations. Do not create personas for products, projects, documents, places, technologies, markets or abstract groups. Entity types for people must use only these names: Person, Expert, Official, Journalist, PublicFigure, Activist, Professor, Student. Put every customer, owner, buyer, employee, dealer, salesperson, investor, staff member of a competitor and community member under Person (or Expert, Official or Journalist where that fits), and describe their role in their attributes, never as a new type such as Customer, Dealer or Loyalist. Entity types for organisations must use only these names: Company, Organization, MediaOutlet, GovernmentAgency, Institution, NGO, Community, University.'

export const ontologyRequirement = (question: string) => `${question.trim()}\n\n${CAST_GUIDANCE}`
