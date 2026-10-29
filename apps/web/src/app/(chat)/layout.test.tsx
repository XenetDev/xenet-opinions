// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  available: true,
  providers: { magicLink: true, google: false, github: true, apple: false },
  header: vi.fn(),
  sidebar: vi.fn(),
  cookie: undefined as string | undefined,
  dialog: vi.fn(),
  usage: vi.fn(),
  demoMode: true,
  user: null as { id: string; isAnonymous: boolean } | null,
  usageValue: null as unknown,
}))

vi.mock('next/headers', () => ({
  headers: async () => new Headers(),
  cookies: async () => ({
    get: (name: string) =>
      name === 'sidebar_state' && mocks.cookie !== undefined ? { name, value: mocks.cookie } : undefined,
  }),
}))
vi.mock('@/lib/session', () => ({ getSessionUser: vi.fn(async () => mocks.user) }))
vi.mock('@/lib/auth-providers', () => ({
  signInAvailable: () => mocks.available,
  authProviders: () => mocks.providers,
}))
vi.mock('@/modules/auth/sign-in-dialog', () => ({
  SignInDialogProvider: ({ providers, children }: { providers: unknown; children: ReactNode }) => {
    mocks.dialog(providers)
    return children
  },
}))
vi.mock('@/server/limits', () => ({
  getLimits: (user: { isAnonymous: boolean }) => ({
    demoMode: mocks.demoMode,
    anonymous: user.isAnonymous,
    signedInMaxRunsPerDay: 3,
  }),
}))
vi.mock('@/server/usage', () => ({ getUsage: vi.fn(async () => mocks.usageValue) }))
vi.mock('@/modules/chat/shell/usage-context', () => ({
  UsageProvider: ({ usage, signIn, children }: { usage: unknown; signIn?: unknown; children: ReactNode }) => {
    mocks.usage({ usage, signIn })
    return children
  },
}))
vi.mock('@/server/chats', () => ({ listChats: vi.fn(async () => []) }))
vi.mock('@/modules/chat/header/chat-header', () => ({
  ChatHeader: (props: { onSearch: () => void }) => {
    mocks.header(props)
    return null
  },
}))
vi.mock('@/modules/chat/shell/app-sidebar', async () => {
  const { useSidebar } = await import('@/components/ui/sidebar')
  return {
    AppSidebar: (props: { signInAvailable: boolean; onSearch: () => void }) => {
      mocks.sidebar({ ...props, open: useSidebar().open })
      return null
    },
  }
})

import ChatLayout from './layout'

beforeEach(() => {
  cleanup()
  mocks.header.mockReset()
  mocks.sidebar.mockReset()
  mocks.cookie = undefined
  mocks.dialog.mockReset()
  mocks.usage.mockReset()
  mocks.available = true
  mocks.demoMode = true
  mocks.user = null
  mocks.usageValue = null
})

describe('Chat layout', () => {
  it.each([true, false])('passes signInAvailable=%s to the sidebar', async (available) => {
    mocks.available = available
    render(await ChatLayout({ children: null }))
    expect(mocks.sidebar).toHaveBeenCalledWith(expect.objectContaining({ signInAvailable: available }))
  })

  it('mounts the sidebar and the header with the same search handler around the page', async () => {
    const { getByRole } = render(await ChatLayout({ children: <p>page</p> }))
    expect(mocks.sidebar).toHaveBeenCalled()
    expect(mocks.header).toHaveBeenCalled()
    expect(mocks.header.mock.lastCall?.[0].onSearch).toBe(mocks.sidebar.mock.lastCall?.[0].onSearch)
    expect(getByRole('main').textContent).toBe('page')
  })

  it.each([
    ['no cookie', undefined, true],
    ['sidebar_state=true', 'true', true],
    ['sidebar_state=false', 'false', false],
  ])('opens the sidebar by default with %s', async (_, cookie, open) => {
    mocks.cookie = cookie
    render(await ChatLayout({ children: null }))
    expect(mocks.sidebar.mock.calls[0]?.[0].open).toBe(open)
  })

  it.each([
    ['collapses on a tablet without a cookie', undefined, false],
    ['keeps the saved state on a tablet', 'true', true],
  ])('%s', async (_, cookie, open) => {
    const width = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 900 })
    try {
      mocks.cookie = cookie
      render(await ChatLayout({ children: null }))
      expect(mocks.sidebar.mock.lastCall?.[0].open).toBe(open)
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
    }
  })

  it('mounts the sign-in dialog provider with the provider flags', async () => {
    render(await ChatLayout({ children: null }))
    expect(mocks.dialog).toHaveBeenCalledWith(mocks.providers)
  })

  it('upsells sign-in to anonymous users in demo mode when a provider is available', async () => {
    render(await ChatLayout({ children: null }))
    expect(mocks.usage).toHaveBeenCalledWith({ usage: null, signIn: { max: 3 } })
  })

  it.each([
    ['no provider is available', { available: false }],
    ['demo mode is off', { demoMode: false }],
    ['the user is signed in', { user: { id: 'u1', isAnonymous: false } }],
  ])('does not upsell sign-in when %s', async (_, over) => {
    Object.assign(mocks, over)
    render(await ChatLayout({ children: null }))
    expect(mocks.usage.mock.calls[0]?.[0].signIn).toBeUndefined()
  })

  it('seeds usage for a signed-in user', async () => {
    mocks.user = { id: 'u1', isAnonymous: false }
    mocks.usageValue = { used: 1, max: 3, resetAt: null }
    render(await ChatLayout({ children: null }))
    expect(mocks.usage).toHaveBeenCalledWith({ usage: mocks.usageValue, signIn: undefined })
  })
})
