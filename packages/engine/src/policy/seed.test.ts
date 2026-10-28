import { describe, expect, it } from 'vitest'
import { buildSeedDocument, needsSeedContext, SEED_PROMPT_MIN_WORDS, wordCount } from './seed'

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ')

describe('wordCount', () => {
  it.each([
    ['', 0],
    ['a  b', 2],
    ['  one\ntwo\tthree  ', 3],
    [words(39), 39],
  ])('counts %j as %i', (text, count) => {
    expect(wordCount(text)).toBe(count)
  })
})

describe('needsSeedContext', () => {
  it('uses a 40 word threshold', () => {
    expect(SEED_PROMPT_MIN_WORDS).toBe(40)
    expect(needsSeedContext(words(39), 0)).toBe(true)
    expect(needsSeedContext(words(40), 0)).toBe(false)
  })

  it('never asks when a document is attached', () => {
    expect(needsSeedContext('short', 1)).toBe(false)
  })
})

describe('buildSeedDocument', () => {
  it('writes every section', () => {
    expect(
      buildSeedDocument({
        question: 'Should we raise prices?',
        background: 'Small SaaS, 2k customers',
        actors: 'Customers and staff',
        change: 'A 20% price rise',
      }),
    ).toBe(
      '# Scenario\n\nShould we raise prices?\n\n## Background and constraints\nSmall SaaS, 2k customers\n\n## Who is involved\nCustomers and staff\n\n## What is changing\nA 20% price rise\n',
    )
  })

  it('marks missing sections as not provided', () => {
    expect(buildSeedDocument({ question: 'Should we raise prices?' })).toBe(
      '# Scenario\n\nShould we raise prices?\n\n## Background and constraints\nNot provided.\n\n## Who is involved\nNot provided.\n\n## What is changing\nNot provided.\n',
    )
  })
})
