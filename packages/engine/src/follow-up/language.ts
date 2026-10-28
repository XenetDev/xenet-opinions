import type { MiroFishLocale } from '@xo/mirofish'

const INSTRUCTIONS: Partial<Record<MiroFishLocale, string>> = {
  en: 'Answer in English.',
  de: 'Antworte auf Deutsch.',
  es: 'Responde en español.',
  fr: 'Réponds en français.',
  pt: 'Responda em português.',
  ru: 'Отвечайте на русском языке.',
}

export const languageInstruction = (locale: MiroFishLocale | undefined): string =>
  (locale && INSTRUCTIONS[locale]) ?? ''

export const withLanguage = (prompt: string, locale: MiroFishLocale | undefined): string => {
  const instruction = languageInstruction(locale)
  return instruction ? `${prompt}\n\n${instruction}` : prompt
}
