import { describe, expect, it } from 'vitest'
import { aggregate, type Classified } from './aggregate'

const person = (
  agentId: string,
  group: [string, string],
  sentiment: number | null,
  action: Classified['action'],
  concern: string | null,
  kind: Classified['kind'] = 'person',
): Classified => ({
  agentId,
  name: `Name ${agentId}`,
  groupId: group[0],
  groupLabel: group[1],
  kind,
  sentiment,
  action,
  opinion: sentiment === null ? 'No view expressed' : 'An opinion',
  concern,
})

const customers: [string, string] = ['customers', 'Customers']
const dealers: [string, string] = ['dealers-partners', 'Dealers/partners']
const competitors: [string, string] = ['competitors', 'Competitors']

const FIXTURE: Classified[] = [
  person('c1', customers, 4, 'act', 'price'),
  person('c2', customers, 2, 'act', 'Price'),
  person('c3', customers, -3, 'not_act', 'price'),
  person('c4', customers, 0, 'unsure', 'reliability'),
  person('c5', customers, -1, 'not_act', ' price  '),
  person('c6', customers, null, 'unsure', null),
  person('d1', dealers, 3, 'act', 'margins'),
  person('d2', dealers, -2, 'not_act', 'reliability'),
  person('d3', dealers, 1, 'act', null),
  person('o1', competitors, -4, 'n/a', 'reliability', 'organisation'),
  person('o2', competitors, 5, 'n/a', 'margins', 'organisation'),
  person('o3', competitors, null, 'n/a', null, 'organisation'),
]

describe('aggregate', () => {
  it('computes exact headline, split and group numbers for 12 classified personas', () => {
    expect(aggregate(FIXTURE)).toEqual({
      headline: {
        sentiment: 0.5,
        actShare: 0.5,
        switchShare: 0.38,
        topConcern: { label: 'price', count: 4 },
        counted: 8,
        actCount: 4,
        switchCount: 3,
      },
      split: { positive: 5, neutral: 1, negative: 4 },
      groups: [
        { id: 'customers', label: 'Customers', people: 6, sentiment: 0.4, actShare: 0.4, counted: 5, actCount: 2 },
        {
          id: 'dealers-partners',
          label: 'Dealers/partners',
          people: 3,
          sentiment: 0.7,
          actShare: 0.67,
          counted: 3,
          actCount: 2,
        },
        { id: 'competitors', label: 'Competitors', people: 3, sentiment: 0.5, actShare: null, counted: 0, actCount: 0 },
      ],
    })
  })

  it('leaves personas with no view out of averages, split and shares', () => {
    const silent = [person('x1', customers, null, 'unsure', null), person('x2', customers, null, 'unsure', null)]
    expect(aggregate(silent)).toEqual({
      headline: {
        sentiment: null,
        actShare: null,
        switchShare: null,
        topConcern: null,
        counted: 0,
        actCount: 0,
        switchCount: 0,
      },
      split: { positive: 0, neutral: 0, negative: 0 },
      groups: [
        { id: 'customers', label: 'Customers', people: 2, sentiment: null, actShare: null, counted: 0, actCount: 0 },
      ],
    })
    const mixed = aggregate([...silent, person('x3', customers, -2, 'not_act', 'cost')])
    expect(mixed.headline).toEqual({
      sentiment: -2,
      actShare: 0,
      switchShare: 1,
      topConcern: { label: 'cost', count: 1 },
      counted: 1,
      actCount: 0,
      switchCount: 1,
    })
  })
})
