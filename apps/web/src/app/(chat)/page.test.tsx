import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ available: true }))

vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('@/lib/session', () => ({ getSessionUser: vi.fn() }))
vi.mock('@/lib/auth-providers', () => ({ signInAvailable: () => mocks.available }))
vi.mock('@/server/chats', () => ({ listChats: vi.fn(async () => []) }))
vi.mock('@/server/usage', () => ({ getUsage: vi.fn(async () => null) }))
vi.mock('@/server/limits', () => ({
  getLimits: (user: { isAnonymous: boolean }) => ({
    demoMode: true,
    paused: false,
    maxRunsPerDay: user.isAnonymous ? 1 : 3,
    signedInMaxRunsPerDay: 3,
    anonymous: user.isAnonymous,
    maxRounds: 3,
    allowPause: false,
  }),
}))
vi.mock('@/modules/chat/home/home-chat', () => ({ HomeChat: () => null }))

import { getSessionUser } from '@/lib/session'
import { sessionUser } from '@/test/session-user'
import Home from './page'

beforeEach(() => {
  mocks.available = true
  vi.mocked(getSessionUser).mockResolvedValue(sessionUser())
})

describe('Home page', () => {
  it('upsells sign-in to anonymous users when a provider is available', async () => {
    const element = await Home()
    expect(element.props.signIn).toEqual({ max: 3 })
  })

  it('does not upsell sign-in when no provider is available', async () => {
    mocks.available = false
    const element = await Home()
    expect(element.props).not.toHaveProperty('signIn')
  })
})
