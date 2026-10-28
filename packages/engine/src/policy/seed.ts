export const SEED_PROMPT_MIN_WORDS = 40
export const SEED_FIELD_MAX = 2000

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}

export function needsSeedContext(text: string, uploadCount: number): boolean {
  return uploadCount === 0 && wordCount(text) < SEED_PROMPT_MIN_WORDS
}

const DEFAULT_BACKGROUND =
  'A present-day, realistic setting for the question above. The organisation behind the decision is established, with existing customers, staff, competitors and press coverage.'

const DEFAULT_ACTORS = [
  '- Existing customers who use the product or service today, including individuals, small teams and larger accounts',
  '- Prospective customers comparing alternatives',
  "- The organisation's leadership, product team and front-line support staff",
  '- Two or three competing providers in the same market',
  '- Trade press, industry analysts and local media',
  '- Online communities and social media where customers discuss the product',
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
