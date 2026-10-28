import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ available: true }))

vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('not found')
  },
}))
vi.mock('@/lib/session', () => ({ getSessionUser: vi.fn() }))
vi.mock('@/lib/auth-providers', () => ({ signInAvailable: () => mocks.available }))
vi.mock('@/server/chats', () => ({
  getOwnedChat: vi.fn(async () => ({ id: 'c1', createdAt: new Date('2026-10-28T00:00:00Z') })),
}))
vi.mock('@/server/chat-page', () => ({
  loadChatPage: vi.fn(async () => ({ initialMessages: [], activeRun: null, latestRun: null })),
}))
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
vi.mock('@/modules/chat/chat', () => ({ Chat: () => null }))

import { getSessionUser } from '@/lib/session'
import { sessionUser } from '@/test/session-user'
import ChatPage from './page'

const open = () => ChatPage({ params: Promise.resolve({ id: 'c1' }) })

beforeEach(() => {
  mocks.available = true
  vi.mocked(getSessionUser).mockResolvedValue(sessionUser())
})

describe('Chat page', () => {
  it('upsells sign-in to anonymous users when a provider is available', async () => {
    expect((await open()).props.signIn).toEqual({ max: 3 })
  })

  it('does not upsell sign-in when no provider is available', async () => {
    mocks.available = false
    expect((await open()).props).not.toHaveProperty('signIn')
  })
})
