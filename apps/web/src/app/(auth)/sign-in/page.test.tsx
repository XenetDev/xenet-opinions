// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthProviders } from '@/lib/auth-providers'
import type { SessionUser } from '@/lib/session'
import { axe } from '@/test/axe'

const REDIRECT = new Error('NEXT_REDIRECT')

const mocks = vi.hoisted(() => ({
  user: null as SessionUser | null,
  providers: { magicLink: true, google: true, github: false, apple: false } as AuthProviders,
  redirect: vi.fn(),
  magicLink: vi.fn(),
}))

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('@/lib/session', () => ({ getSessionUser: async () => mocks.user }))
vi.mock('@/lib/auth-providers', () => ({ authProviders: () => mocks.providers }))
vi.mock('@/lib/auth-client', () => ({ authClient: { signIn: { magicLink: mocks.magicLink, social: vi.fn() } } }))

import SignInPage, { dynamic, metadata } from './page'

const user = (isAnonymous: boolean): SessionUser => ({
  id: 'u1',
  isAnonymous,
  email: 'ada@example.com',
  name: 'Ada',
  image: null,
})

const page = (params: Record<string, string>) => SignInPage({ searchParams: Promise.resolve(params) })

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as never
})

beforeEach(() => {
  mocks.user = null
  mocks.providers = { magicLink: true, google: true, github: false, apple: false }
  mocks.redirect.mockReset().mockImplementation(() => {
    throw REDIRECT
  })
})

afterEach(() => {
  cleanup()
})

describe('sign-in page', () => {
  it('is dynamic and not indexed', () => {
    expect(dynamic).toBe('force-dynamic')
    expect(metadata.title).toBe('Sign in · Xenet Opinions')
    expect(metadata.robots).toEqual({ index: false, follow: false })
  })

  it('redirects a registered user to next', async () => {
    mocks.user = user(false)
    await expect(page({ next: '/c/abc' })).rejects.toBe(REDIRECT)
    expect(mocks.redirect).toHaveBeenCalledWith('/c/abc')
  })

  it('renders the form and panel for an anonymous user', async () => {
    mocks.user = user(true)
    const { container } = render((await page({ next: '/c/abc' })) as ReactElement)
    expect(mocks.redirect).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Email' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Continue with GitHub' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Ask how people would react before you decide.' })).toBeTruthy()
    for (const line of [
      'Attach a few documents, ask a question, and watch a simulated public form an opinion.',
      'More runs a day than a guest',
      'Your conversations on every device',
      'Pick up a chat later, wherever you are',
    ])
      expect(screen.getByText(line)).toBeTruthy()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('sanitises next before handing it to the form', async () => {
    mocks.providers = { magicLink: false, google: false, github: false, apple: false }
    render((await page({ next: '//evil' })) as ReactElement)
    expect(screen.getByRole('link', { name: 'Continue without signing in' }).getAttribute('href')).toBe('/')
  })

  it('maps any error query to the expired notice', async () => {
    render((await page({ error: 'INVALID_TOKEN' })) as ReactElement)
    expect(screen.getByText('That link has expired or was already used. Request a new one.')).toBeTruthy()
    cleanup()
    render((await page({})) as ReactElement)
    expect(screen.queryByText('That link has expired or was already used. Request a new one.')).toBeNull()
  })
})
