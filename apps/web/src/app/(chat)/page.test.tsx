import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('@/env', () => ({ env: { EXA_API_KEY: undefined as string | undefined } }))
vi.mock('@/lib/session', () => ({ getSessionUser: vi.fn() }))
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

import { env } from '@/env'
import { getSessionUser } from '@/lib/session'
import { sessionUser } from '@/test/session-user'
import Home from './page'

beforeEach(() => {
  vi.mocked(getSessionUser).mockResolvedValue(sessionUser())
})

describe('Home page', () => {
  it('passes limits and no usage or recent props to HomeChat', async () => {
    const element = await Home()
    expect(element.props.limits).toMatchObject({ signedInMaxRunsPerDay: 3 })
    expect(element.props).not.toHaveProperty('signIn')
    expect(element.props).not.toHaveProperty('usage')
    expect(element.props).not.toHaveProperty('recent')
  })

  it('offers web research only when Exa is configured', async () => {
    expect((await Home()).props.webResearchAvailable).toBe(false)
    env.EXA_API_KEY = 'exa-key'
    expect((await Home()).props.webResearchAvailable).toBe(true)
    env.EXA_API_KEY = undefined
  })
})
