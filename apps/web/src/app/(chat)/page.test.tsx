import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('@/lib/session', () => ({ getSessionUser: vi.fn() }))
vi.mock('@/server/chats', () => ({ listChats: vi.fn(async () => []) }))
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
  vi.mocked(getSessionUser).mockResolvedValue(sessionUser())
})

describe('Home page', () => {
  it('passes limits and no usage props to HomeChat', async () => {
    const element = await Home()
    expect(element.props.limits).toMatchObject({ signedInMaxRunsPerDay: 3 })
    expect(element.props).not.toHaveProperty('signIn')
    expect(element.props).not.toHaveProperty('usage')
  })
})
