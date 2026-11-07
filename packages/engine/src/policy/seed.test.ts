import { describe, expect, it } from 'vitest'
import {
  buildSeedDocument,
  CAST_GUIDANCE,
  castCharsMax,
  castGroups,
  castPeople,
  castWithinPlan,
  needsSeedContext,
  ontologyRequirement,
  SEED_ACTORS_MAX,
  SEED_PROMPT_MIN_WORDS,
  wordCount,
} from './seed'

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

  it('fills missing sections with stakeholder defaults', () => {
    expect(buildSeedDocument({ question: 'Should we raise prices?' })).toBe(
      "# Scenario\n\nShould we raise prices?\n\n## Background and constraints\nA present-day, realistic setting for the question above. The people and organisations involved already exist, know each other's positions, and talk about the decision in public.\n\n## Who is involved\n- The people directly affected by the decision, across different ages, budgets and levels of dependence on what is changing\n- The organisation or authority making the decision, including its leadership and front-line staff\n- Organisations with a competing or opposing interest\n- Journalists, analysts and commentators who cover the topic\n- Online communities and social media where the decision is discussed\n\n## What is changing\nThe decision described in the question is announced publicly and takes effect within the next month.\n",
    )
  })
})

describe('ontologyRequirement', () => {
  it('keeps the question and asks for people and named organisations only', () => {
    const requirement = ontologyRequirement('  Is this a good investment?  ')
    expect(requirement.startsWith('Is this a good investment?\n\n')).toBe(true)
    expect(requirement).toContain(CAST_GUIDANCE)
    expect(CAST_GUIDANCE).toContain('Do not create personas for products, projects, documents')
  })
})

describe('cast limits', () => {
  const cast = (groups: Record<string, number>) =>
    Object.entries(groups)
      .flatMap(([group, n]) => [
        `${group}:`,
        ...Array.from({ length: n }, (_, i) => `- Person ${group} ${i}, 30, role, City: view`),
      ])
      .join('\n')

  it('counts person lines that start with "- "', () => {
    expect(castPeople(cast({ Customers: 3, Media: 2 }))).toBe(5)
    expect(castPeople('  - indented\n-no space\nCustomers:\n\n- one')).toBe(2)
    expect(castPeople('')).toBe(0)
  })

  it('parses group headings, trimmed, de-duplicated and at most 12', () => {
    expect(castGroups(cast({ 'Pro customers': 1, Media: 1 }))).toEqual(['Pro customers', 'Media'])
    expect(castGroups('  Customers:  \n- a: b\nCustomers:\n**Dealers:**\n: \nNot a heading')).toEqual([
      'Customers',
      'Dealers',
    ])
    const many = Array.from({ length: 15 }, (_, i) => `Group ${i}:`).join('\n')
    expect(castGroups(many)).toHaveLength(12)
  })

  it('allows the plan maximum plus a slack of max(2, 10%)', () => {
    expect(castWithinPlan(cast({ A: 12 }), 10)).toBe(true)
    expect(castWithinPlan(cast({ A: 13 }), 10)).toBe(false)
    expect(castWithinPlan(cast({ A: 30 }), 10)).toBe(false)
    expect(castWithinPlan(cast({ A: 28 }), 25)).toBe(true)
    expect(castWithinPlan(cast({ A: 29 }), 25)).toBe(false)
    expect(castWithinPlan(cast({ A: 55 }), 50)).toBe(true)
    expect(castWithinPlan(cast({ A: 56 }), 50)).toBe(false)
    expect(castWithinPlan(undefined, 10)).toBe(true)
  })

  it('caps the cast length at 300 characters per participant, never above SEED_ACTORS_MAX', () => {
    expect(castCharsMax(10)).toBe(3000)
    expect(castCharsMax(50)).toBe(SEED_ACTORS_MAX)
    expect(castWithinPlan('x'.repeat(3000), 10)).toBe(true)
    expect(castWithinPlan('x'.repeat(3001), 10)).toBe(false)
  })
})
