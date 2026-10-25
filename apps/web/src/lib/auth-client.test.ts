import { describe, expect, it, vi } from 'vitest'

vi.mock('better-auth/react', () => ({ createAuthClient: vi.fn(() => ({})) }))

import { createAuthClient } from 'better-auth/react'

describe('authClient', () => {
  it('uses the same origin instead of a baked-in baseURL', async () => {
    await import('./auth-client')
    expect(createAuthClient).toHaveBeenCalledTimes(1)
    const options = vi.mocked(createAuthClient).mock.calls[0]?.[0]
    expect(options === undefined || !('baseURL' in options)).toBe(true)
  })
})
