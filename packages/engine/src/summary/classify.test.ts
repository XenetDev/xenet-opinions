import { describe, expect, it } from 'vitest'
import {
  ClassifyError,
  classify,
  classifySystem,
  matchGroup,
  NO_VIEW,
  NOT_CLASSIFIED,
  type Persona,
  slug,
  verbatim,
} from './classify'
import { agentIdsIn, mockModel } from './test-model'

const entry = (agentId: string, over: Record<string, unknown> = {}) => ({
  agentId,
  group: 'Customers',
  kind: 'person',
  age: 41,
  role: 'Teacher',
  location: 'Leeds',
  sentiment: 3,
  action: 'act',
  concern: 'price',
  opinion: 'Would pay more for faster support.',
  quote: null,
  ...over,
})

const persona = (agentId: string, texts: string[] = [`I am ${agentId} and I like it.`]): Persona => ({
  agentId,
  name: `Person ${agentId}`,
  profile: 'A customer',
  texts,
})

const signal = new AbortController().signal

describe('verbatim', () => {
  it('matches case- and whitespace-insensitively and strips wrapping quotes', () => {
    expect(verbatim('"I would  PAY more"', ['Honestly, i would pay\nmore if it works.'])).toBe('i would pay\nmore')
    expect(verbatim('I would pay double', ['Honestly, i would pay more.'])).toBeUndefined()
    expect(verbatim('', ['anything'])).toBeUndefined()
    expect(verbatim(null, ['anything'])).toBeUndefined()
  })
})

describe('matchGroup', () => {
  it('maps a label to the nearest configured group, else Other', () => {
    const groups = ['Customers', 'Dealers/partners']
    expect(matchGroup('customers', groups)).toBe('Customers')
    expect(matchGroup('Customer', groups)).toBe('Customers')
    expect(matchGroup('DEALERS-PARTNERS', groups)).toBe('Dealers/partners')
    expect(matchGroup('Dealers', groups)).toBe('Dealers/partners')
    expect(matchGroup('Regulators', groups)).toBe('Other')
    expect(matchGroup(null, groups)).toBe('Other')
    expect(matchGroup('Owners', undefined)).toBe('Owners')
    expect(matchGroup(null, undefined)).toBe('Other')
  })
})

describe('slug', () => {
  it('normalises a label to an id', () => {
    expect(slug('Dealers/partners')).toBe('dealers-partners')
    expect(slug('  Owners ')).toBe('owners')
    expect(slug('!!!')).toBe('other')
  })
})

describe('classify', () => {
  it('keeps verbatim quotes and drops fabricated ones', async () => {
    const model = mockModel(() => ({
      participants: [
        entry('a', { quote: 'I would pay more if support were faster.' }),
        entry('b', { quote: 'This is the best decision ever made.' }),
      ],
    }))
    const result = await classify(
      [persona('a', ['Honestly I would pay more if support were faster. Maybe.']), persona('b', ['Not sure.'])],
      { model, abortSignal: signal },
    )
    expect(result[0]).toMatchObject({ agentId: 'a', quote: 'I would pay more if support were faster.' })
    expect(result[1]).not.toHaveProperty('quote')
    expect(result[1]).toMatchObject({ agentId: 'b', sentiment: 3, opinion: 'Would pay more for faster support.' })
  })

  it('ignores agent ids the model invents and marks omitted personas as not classified', async () => {
    const model = mockModel(() => ({ participants: [entry('ghost', { quote: 'I am a it.' }), entry('a')] }))
    const result = await classify([persona('a'), persona('b')], { model, abortSignal: signal })
    expect(result.map((c) => c.agentId)).toEqual(['a', 'b'])
    expect(result[1]).toMatchObject({ sentiment: null, action: 'unsure', opinion: 'Not classified' })
  })

  it('gives personas with no text no view, whatever the model says', async () => {
    const model = mockModel(() => ({
      participants: [
        entry('a', { sentiment: 5, quote: 'anything' }),
        entry('o', { kind: 'organisation', group: 'Competitors', sentiment: -4, action: 'not_act' }),
      ],
    }))
    const result = await classify([persona('a', []), persona('o', ['  '])], { model, abortSignal: signal })
    expect(result[0]).toEqual({
      agentId: 'a',
      name: 'Person a',
      age: 41,
      role: 'Teacher',
      location: 'Leeds',
      groupId: 'customers',
      groupLabel: 'Customers',
      kind: 'person',
      sentiment: null,
      action: 'unsure',
      opinion: NO_VIEW,
      concern: null,
    })
    expect(result[1]).toMatchObject({ kind: 'organisation', action: 'n/a', sentiment: null, opinion: NO_VIEW })
  })

  it('clamps sentiment, forces n/a for organisations and unsure for people answering n/a', async () => {
    const model = mockModel(() => ({
      participants: [
        entry('a', { sentiment: 9, action: 'n/a' }),
        entry('o', { kind: 'organisation', sentiment: -7.4, action: 'act' }),
      ],
    }))
    const result = await classify([persona('a'), persona('o')], { model, abortSignal: signal })
    expect(result[0]).toMatchObject({ sentiment: 5, action: 'unsure' })
    expect(result[1]).toMatchObject({ sentiment: -5, action: 'n/a' })
  })

  it('sends batches of 10 with at most 3 in flight, and constrains groups when configured', async () => {
    let inFlight = 0
    let peak = 0
    const prompts: string[] = []
    const model = mockModel(({ system, prompt }) => {
      expect(system).toBe(classifySystem)
      expect(system).toMatch(/json/i)
      prompts.push(prompt)
      return { participants: agentIdsIn(prompt).map((id) => entry(id, { group: 'Dealers/partners' })) }
    })
    const doGenerate = model.doGenerate
    model.doGenerate = async (options) => {
      peak = Math.max(peak, ++inFlight)
      await new Promise((resolve) => setTimeout(resolve, 5))
      try {
        return await doGenerate(options)
      } finally {
        inFlight--
      }
    }
    const personas = Array.from({ length: 45 }, (_, i) => persona(String(i)))
    const result = await classify(personas, { model, abortSignal: signal, groups: ['Customers', 'Dealers/partners'] })
    expect(prompts.map((p) => agentIdsIn(p).length).sort((a, b) => b - a)).toEqual([10, 10, 10, 10, 5])
    expect(peak).toBe(3)
    expect(prompts[0]).toContain('exactly one of these groups: Customers, Dealers/partners')
    expect(result.map((c) => c.agentId)).toEqual(personas.map((p) => p.agentId))
    expect(result[0]).toMatchObject({ groupId: 'dealers-partners', groupLabel: 'Dealers/partners' })
  })

  it('rejects when every batch fails', async () => {
    const errors: unknown[] = []
    const model = mockModel(() => {
      throw new Error('rate limited')
    })
    await expect(
      classify([persona('a')], { model, abortSignal: signal, onBatchError: (e) => errors.push(e) }),
    ).rejects.toBeInstanceOf(ClassifyError)
    expect(errors).toHaveLength(1)
  })

  it('marks a failed batch as not classified and keeps the others', async () => {
    const model = mockModel(({ prompt }) => {
      const ids = agentIdsIn(prompt)
      if (ids.includes('10')) throw new Error('rate limited')
      return { participants: ids.map((id) => entry(id)) }
    })
    const personas = Array.from({ length: 15 }, (_, i) => persona(String(i)))
    const result = await classify(personas, { model, abortSignal: signal })
    expect(result.slice(0, 10).every((c) => c.sentiment === 3)).toBe(true)
    expect(result.slice(10).map((c) => c.opinion)).toEqual(Array(5).fill(NOT_CLASSIFIED))
  })

  it('costs one persona, not the batch, for malformed entries', async () => {
    const model = mockModel(() => ({
      participants: [
        entry('a', { group: 'dealers / Partners', kind: 'Organization', sentiment: '-2' }),
        entry('b', { group: 'Customer', sentiment: null }),
        entry('c', { group: 'Martians', action: 'maybe', age: 'unknown', kind: 7 }),
        { agentId: { bad: true } },
        entry('d', { sentiment: 'lots', opinion: 42, quote: ['x'] }),
        'garbage',
      ],
    }))
    const result = await classify([persona('a'), persona('b'), persona('c'), persona('d'), persona('e')], {
      model,
      abortSignal: signal,
      groups: ['Customers', 'Dealers/partners'],
    })
    expect(result[0]).toMatchObject({
      groupLabel: 'Dealers/partners',
      kind: 'organisation',
      sentiment: -2,
      action: 'n/a',
    })
    expect(result[1]).toMatchObject({ groupLabel: 'Customers', sentiment: null, action: 'unsure', opinion: NO_VIEW })
    expect(result[2]).toMatchObject({ groupId: 'other', groupLabel: 'Other', kind: 'person', action: 'unsure' })
    expect(result[2]).not.toHaveProperty('age')
    expect(result[3]).toMatchObject({ sentiment: null, opinion: NO_VIEW })
    expect(result[4]).toMatchObject({ sentiment: null, opinion: NOT_CLASSIFIED })
  })

  it('stops dispatching batches once a check throws', async () => {
    const prompts: string[] = []
    const model = mockModel(({ prompt }) => {
      prompts.push(prompt)
      return { participants: agentIdsIn(prompt).map((id) => entry(id)) }
    })
    const personas = Array.from({ length: 60 }, (_, i) => persona(String(i)))
    let checks = 0
    const beforeBatch = async () => {
      if (++checks >= 2) throw new Error('cancelled')
    }
    await expect(classify(personas, { model, abortSignal: signal, beforeBatch })).rejects.toThrow('cancelled')
    expect(prompts.length).toBeLessThan(6)
  })

  it('stops dispatching batches once the budget is spent', async () => {
    const controller = new AbortController()
    let calls = 0
    const model = mockModel(({ prompt }) => {
      calls++
      controller.abort()
      return { participants: agentIdsIn(prompt).map((id) => entry(id)) }
    })
    const personas = Array.from({ length: 60 }, (_, i) => persona(String(i)))
    await expect(classify(personas, { model, abortSignal: controller.signal })).rejects.toThrow()
    expect(calls).toBeLessThanOrEqual(3)
  })
})
