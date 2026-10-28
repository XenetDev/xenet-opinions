// @vitest-environment jsdom

import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  available: true,
  providers: { magicLink: true, google: false, github: true, apple: false },
  header: vi.fn(),
  dialog: vi.fn(),
}))

vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('@/lib/session', () => ({ getSessionUser: vi.fn(async () => null) }))
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
vi.mock('@/server/chats', () => ({ listChats: vi.fn(async () => []) }))
vi.mock('@/modules/chat/header/chat-header', () => ({
  ChatHeader: (props: { signInAvailable: boolean }) => {
    mocks.header(props)
    return null
  },
}))

import ChatLayout from './layout'

beforeEach(() => {
  mocks.header.mockReset()
  mocks.dialog.mockReset()
})

describe('Chat layout', () => {
  it.each([true, false])('passes signInAvailable=%s to the header', async (available) => {
    mocks.available = available
    render(await ChatLayout({ children: null }))
    expect(mocks.header).toHaveBeenCalledWith({ signInAvailable: available })
  })

  it('mounts the sign-in dialog provider with the provider flags', async () => {
    render(await ChatLayout({ children: null }))
    expect(mocks.dialog).toHaveBeenCalledWith(mocks.providers)
  })
})
