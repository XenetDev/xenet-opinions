import { generateId } from 'ai'
import { describe, expect, it } from 'vitest'
import { isChatId } from './chat-id'

describe('isChatId', () => {
  it('accepts a generateId value and a 32-char id', () => {
    expect(generateId()).toHaveLength(16)
    expect(isChatId(generateId())).toBe(true)
    expect(isChatId('a'.repeat(32))).toBe(true)
    expect(isChatId('Ab_-'.repeat(4))).toBe(true)
  })

  it('rejects ids out of length or with path characters', () => {
    expect(isChatId('a'.repeat(15))).toBe(false)
    expect(isChatId('a'.repeat(33))).toBe(false)
    expect(isChatId(`${'a'.repeat(15)}/`)).toBe(false)
    expect(isChatId(`${'a'.repeat(15)}.`)).toBe(false)
    expect(isChatId('')).toBe(false)
  })
})
