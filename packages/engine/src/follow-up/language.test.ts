import type { MiroFishLocale } from '@xo/mirofish'
import { describe, expect, it } from 'vitest'
import { languageInstruction, withLanguage } from './language'

describe('languageInstruction', () => {
  it.each<[MiroFishLocale, string]>([
    ['en', 'Answer in English.'],
    ['de', 'Antworte auf Deutsch.'],
    ['es', 'Responde en español.'],
    ['fr', 'Réponds en français.'],
    ['pt', 'Responda em português.'],
    ['ru', 'Отвечайте на русском языке.'],
    ['zh', ''],
  ])('%s', (locale, instruction) => {
    expect(languageInstruction(locale)).toBe(instruction)
    expect(withLanguage('Why?', locale)).toBe(instruction ? `Why?\n\n${instruction}` : 'Why?')
  })

  it('appends nothing for an unknown or missing locale', () => {
    expect(withLanguage('Why?', undefined)).toBe('Why?')
    expect(withLanguage('Why?', 'jp' as MiroFishLocale)).toBe('Why?')
  })
})
