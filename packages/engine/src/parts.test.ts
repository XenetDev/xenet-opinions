import { describe, expect, it } from 'vitest'
import { STAGES, stagePartId } from './parts'

describe('parts', () => {
  it('builds stage part ids', () => {
    expect(stagePartId('ontology')).toBe('stage:ontology')
  })

  it('lists seven stages starting with ontology', () => {
    expect(STAGES).toHaveLength(7)
    expect(STAGES[0]).toBe('ontology')
  })
})
