export const SEED_PROMPT_MIN_WORDS = 40
export const SEED_FIELD_MAX = 2000

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
