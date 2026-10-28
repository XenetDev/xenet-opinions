import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/session'

const REDIRECT = new Error('NEXT_REDIRECT')

const mocks = vi.hoisted(() => ({
  user: null as SessionUser | null,
  redirect: vi.fn(),
}))

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('@/lib/session', () => ({ getSessionUser: async () => mocks.user }))

import SignInPage, { dynamic, metadata } from './page'

const user = (isAnonymous: boolean): SessionUser => ({
  id: 'u1',
  isAnonymous,
  email: 'ada@example.com',
  name: 'Ada',
  image: null,
})

const target = async (params: Record<string, string>) => {
  await expect(SignInPage({ searchParams: Promise.resolve(params) })).rejects.toBe(REDIRECT)
  expect(mocks.redirect).toHaveBeenCalledOnce()
  return mocks.redirect.mock.calls[0]?.[0]
}

beforeEach(() => {
  mocks.user = null
  mocks.redirect.mockReset().mockImplementation(() => {
    throw REDIRECT
  })
})

describe('sign-in page', () => {
  it('is dynamic and not indexed', () => {
    expect(dynamic).toBe('force-dynamic')
    expect(metadata.title).toBe('Sign in · Xenet Opinions')
    expect(metadata.robots).toEqual({ index: false, follow: false })
  })

  it('redirects a registered user to plain next', async () => {
    mocks.user = user(false)
    expect(await target({ next: '/c/abc' })).toBe('/c/abc')
  })

  it('opens the dialog on next for an anonymous user', async () => {
    mocks.user = user(true)
    expect(await target({ next: '/c/abc' })).toBe('/c/abc?signIn=1')
  })

  it('flags an expired link for any error query', async () => {
    expect(await target({ error: 'INVALID_TOKEN' })).toBe('/?signIn=1&signInError=expired')
  })

  it('keeps the query and hash already on next', async () => {
    expect(await target({ next: '/c/abc?tab=report#top' })).toBe('/c/abc?tab=report&signIn=1#top')
  })

  it('sanitises next before redirecting', async () => {
    expect(await target({ next: '//evil' })).toBe('/?signIn=1')
    mocks.redirect.mockClear()
    expect(await target({ next: '/sign-in?next=%2F' })).toBe('/?signIn=1')
  })
})
