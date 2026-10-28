import { describe, expect, it, vi } from 'vitest'
import { authProvidersFrom } from '@/lib/auth-providers'

vi.mock('@/env', () => ({ env: {} }))

const none = {
  RESEND_API_KEY: undefined,
  GOOGLE_CLIENT_ID: undefined,
  GOOGLE_CLIENT_SECRET: undefined,
  GITHUB_CLIENT_ID: undefined,
  GITHUB_CLIENT_SECRET: undefined,
  APPLE_CLIENT_ID: undefined,
  APPLE_CLIENT_SECRET: undefined,
}

describe('authProvidersFrom', () => {
  it.each([
    ['key set in production', { RESEND_API_KEY: 're_1' }, 'production', true],
    ['no key in development', {}, 'development', true],
    ['no key in production', {}, 'production', false],
  ])('magicLink: %s', (_name, source, nodeEnv, expected) => {
    expect(authProvidersFrom({ ...none, ...source }, nodeEnv).magicLink).toBe(expected)
  })

  it.each([
    ['google', 'GOOGLE'],
    ['github', 'GITHUB'],
    ['apple', 'APPLE'],
  ] as const)('%s is true only with both values', (name, prefix) => {
    const id = `${prefix}_CLIENT_ID` as const
    const secret = `${prefix}_CLIENT_SECRET` as const
    expect(authProvidersFrom({ ...none, [id]: 'i', [secret]: 's' }, 'production')[name]).toBe(true)
    expect(authProvidersFrom({ ...none, [id]: 'i' }, 'production')[name]).toBe(false)
    expect(authProvidersFrom({ ...none, [secret]: 's' }, 'production')[name]).toBe(false)
    expect(authProvidersFrom(none, 'production')[name]).toBe(false)
  })
})
