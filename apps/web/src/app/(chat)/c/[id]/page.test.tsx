import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('@/env', () => ({
  env: { EXA_API_KEY: undefined as string | undefined, NEXT_PUBLIC_APP_URL: 'https://opinions.example' },
}))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('not found')
  },
}))
vi.mock('@/lib/session', () => ({ getSessionUser: vi.fn() }))
vi.mock('@/server/chats', () => ({
  getOwnedChat: vi.fn(async () => ({ id: 'c1', createdAt: new Date('2026-10-28T00:00:00Z') })),
}))
vi.mock('@/server/chat-page', () => ({
  loadChatPage: vi.fn(async () => ({ initialMessages: [], activeRun: null, latestRun: null })),
}))
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

import { env } from '@/env'
import { getSessionUser } from '@/lib/session'
import { loadChatPage } from '@/server/chat-page'
import { sessionUser } from '@/test/session-user'
import ChatPage from './page'

const open = () => ChatPage({ params: Promise.resolve({ id: 'c1' }) })

beforeEach(() => {
  vi.mocked(getSessionUser).mockResolvedValue(sessionUser())
})

describe('Chat page', () => {
  it('passes limits and no usage props to Chat', async () => {
    const { props } = await open()
    expect(props.limits).toMatchObject({ signedInMaxRunsPerDay: 3 })
    expect(props).not.toHaveProperty('signIn')
    expect(props).not.toHaveProperty('usage')
  })

  it('offers web research only when Exa is configured', async () => {
    expect((await open()).props.webResearchAvailable).toBe(false)
    env.EXA_API_KEY = 'exa-key'
    expect((await open()).props.webResearchAvailable).toBe(true)
    env.EXA_API_KEY = undefined
  })

  it('passes live share links as full URLs by assistant message', async () => {
    vi.mocked(loadChatPage).mockResolvedValueOnce({
      initialMessages: [],
      activeRun: null,
      latestRun: null,
      runFinishedAt: {},
      runShareTokens: { a1: 'tok1' },
    })
    expect((await open()).props.runShareUrls).toEqual({ a1: 'https://opinions.example/r/tok1' })
  })
})
