export const SEED_PROMPT_MIN_WORDS = 40
export const SEED_FIELD_MAX = 2000

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}

export function needsSeedContext(text: string, uploadCount: number): boolean {
  return uploadCount === 0 && wordCount(text) < SEED_PROMPT_MIN_WORDS
}

export function buildSeedDocument(input: {
  question: string
  background?: string
  actors?: string
  change?: string
}): string {
  const section = (value?: string) => value?.trim() || 'Not provided.'
  return [
    '# Scenario',
    '',
    input.question.trim(),
    '',
    '## Background and constraints',
    section(input.background),
    '',
    '## Who is involved',
    section(input.actors),
    '',
    '## What is changing',
    section(input.change),
    '',
  ].join('\n')
}
