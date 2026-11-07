import { describe, expect, it } from 'vitest'
import { PANEL_GROUPS } from './panel'

describe('PANEL_GROUPS', () => {
  it('lists the chips in order', () => {
    expect(PANEL_GROUPS.map((group) => group.id)).toEqual([
      'customers',
      'prospects',
      'loyalists',
      'skeptics',
      'employees',
      'dealers',
      'competitors',
      'investors',
      'regulators',
      'media',
      'influencers',
    ])
    expect(PANEL_GROUPS.find((group) => group.id === 'dealers')?.label).toBe('Dealers/partners')
  })
})
