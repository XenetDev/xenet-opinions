// @vitest-environment jsdom

import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ available: true, header: vi.fn() }))

vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('@/lib/session', () => ({ getSessionUser: vi.fn(async () => null) }))
vi.mock('@/lib/auth-providers', () => ({ signInAvailable: () => mocks.available }))
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
})

describe('Chat layout', () => {
  it.each([true, false])('passes signInAvailable=%s to the header', async (available) => {
    mocks.available = available
    render(await ChatLayout({ children: null }))
    expect(mocks.header).toHaveBeenCalledWith({ signInAvailable: available })
  })
})
