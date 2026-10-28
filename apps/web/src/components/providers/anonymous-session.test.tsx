// @vitest-environment jsdom

import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const nav = vi.hoisted(() => ({ refresh: vi.fn() }))
const auth = vi.hoisted(() => ({
  session: { data: null, isPending: false } as { data: unknown; isPending: boolean },
  signedIn: false,
  getSession: vi.fn(),
  anonymous: vi.fn(),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: nav.refresh }) }))
vi.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: () => auth.session,
    getSession: auth.getSession,
    signIn: { anonymous: auth.anonymous },
  },
}))

import { AnonymousSession } from './anonymous-session'

function serialisingLocks() {
  let tail: Promise<unknown> = Promise.resolve()
  const request = vi.fn((_name: string, callback: () => Promise<unknown>) => {
    const result = tail.then(callback)
    tail = result.catch(() => {})
    return result
  })
  return { request }
}

const twoTabs = () =>
  render(
    <>
      <AnonymousSession>a</AnonymousSession>
      <AnonymousSession>b</AnonymousSession>
    </>,
  )

beforeEach(() => {
  auth.session = { data: null, isPending: false }
  auth.signedIn = false
  auth.getSession.mockReset().mockImplementation(async () => ({ data: auth.signedIn ? { user: {} } : null }))
  auth.anonymous.mockReset().mockImplementation(async () => {
    auth.signedIn = true
    return { data: {}, error: null }
  })
  nav.refresh.mockReset()
})

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(navigator, 'locks')
})

describe('AnonymousSession', () => {
  it('signs in anonymously once across providers sharing the lock and refreshes once', async () => {
    const locks = serialisingLocks()
    Object.defineProperty(navigator, 'locks', { value: locks, configurable: true })
    twoTabs()
    await waitFor(() => expect(locks.request).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(nav.refresh).toHaveBeenCalledTimes(1))
    expect(locks.request).toHaveBeenCalledWith('xo-anonymous-session', expect.any(Function))
    expect(auth.getSession).toHaveBeenCalledTimes(2)
    expect(auth.anonymous).toHaveBeenCalledTimes(1)
  })

  it('does nothing while pending or with a session', () => {
    auth.session = { data: null, isPending: true }
    const { rerender } = render(<AnonymousSession>a</AnonymousSession>)
    auth.session = { data: { user: {} }, isPending: false }
    rerender(<AnonymousSession>a</AnonymousSession>)
    expect(auth.anonymous).not.toHaveBeenCalled()
  })

  it('signs in directly without navigator.locks and again after a later sign-out', async () => {
    const { rerender } = render(<AnonymousSession>a</AnonymousSession>)
    await waitFor(() => expect(nav.refresh).toHaveBeenCalledTimes(1))
    expect(auth.getSession).not.toHaveBeenCalled()
    auth.session = { data: { user: {} }, isPending: false }
    rerender(<AnonymousSession>a</AnonymousSession>)
    auth.session = { data: null, isPending: false }
    rerender(<AnonymousSession>a</AnonymousSession>)
    await waitFor(() => expect(auth.anonymous).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(nav.refresh).toHaveBeenCalledTimes(2))
  })

  it('does not refresh when the sign-in fails', async () => {
    auth.anonymous.mockResolvedValue({ data: null, error: { status: 429 } })
    render(<AnonymousSession>a</AnonymousSession>)
    await waitFor(() => expect(auth.anonymous).toHaveBeenCalledTimes(1))
    await Promise.resolve()
    expect(nav.refresh).not.toHaveBeenCalled()
  })
})
