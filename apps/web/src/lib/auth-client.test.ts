import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('better-auth/react', () => ({ createAuthClient: vi.fn(() => ({})) }))
vi.mock('better-auth/client/plugins', () => ({
  anonymousClient: vi.fn(() => ({ id: 'anonymous' })),
  magicLinkClient: vi.fn(() => ({ id: 'magic-link' })),
}))

import { createAuthClient } from 'better-auth/react'

let calls: Parameters<typeof createAuthClient>[]

beforeAll(async () => {
  await import('./auth-client')
  calls = [...vi.mocked(createAuthClient).mock.calls]
})

describe('authClient', () => {
  it('uses the same origin instead of a baked-in baseURL', () => {
    expect(calls).toHaveLength(1)
    const options = calls[0]?.[0]
    expect(options === undefined || !('baseURL' in options)).toBe(true)
  })

  it('passes the anonymous and magic-link client plugins', () => {
    expect(calls[0]?.[0]?.plugins).toEqual([{ id: 'anonymous' }, { id: 'magic-link' }])
  })
})
