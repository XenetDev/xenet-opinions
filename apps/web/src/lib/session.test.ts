import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }))
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  cache: <A extends object, R>(fn: (arg: A) => R) => {
    const memo = new WeakMap<A, R>()
    return (arg: A) => {
      if (!memo.has(arg)) memo.set(arg, fn(arg))
      return memo.get(arg) as R
    }
  },
}))

import { auth } from '@/lib/auth'
import { getSessionUser } from './session'

const getSession = vi.mocked(auth.api.getSession) as unknown as ReturnType<typeof vi.fn>

function session(user: Record<string, unknown>) {
  return { session: { id: 's1' }, user: { id: 'u1', email: 'a@example.com', name: 'A', ...user } }
}

beforeEach(() => {
  getSession.mockReset()
})

describe('getSessionUser', () => {
  it('returns null without a session', async () => {
    getSession.mockResolvedValue(null)
    expect(await getSessionUser(new Headers())).toBeNull()
  })

  it('maps an anonymous user', async () => {
    getSession.mockResolvedValue(session({ isAnonymous: true, image: 'https://img/x.png' }))
    expect(await getSessionUser(new Headers())).toEqual({
      id: 'u1',
      isAnonymous: true,
      email: 'a@example.com',
      name: 'A',
      image: 'https://img/x.png',
    })
  })

  it('treats a null isAnonymous as registered', async () => {
    getSession.mockResolvedValue(session({ isAnonymous: null, image: null }))
    expect(await getSessionUser(new Headers())).toMatchObject({ isAnonymous: false, image: null })
  })

  it('maps an undefined image to null', async () => {
    getSession.mockResolvedValue(session({ isAnonymous: false }))
    expect(await getSessionUser(new Headers())).toMatchObject({ isAnonymous: false, image: null })
  })

  it('passes the request headers through', async () => {
    getSession.mockResolvedValue(null)
    const headers = new Headers({ cookie: 'a=b' })
    await getSessionUser(headers)
    expect(getSession).toHaveBeenCalledWith({ headers })
  })

  it('looks the session up once per headers object', async () => {
    getSession.mockResolvedValue(null)
    const headers = new Headers()
    await getSessionUser(headers)
    await getSessionUser(headers)
    expect(getSession).toHaveBeenCalledTimes(1)
    await getSessionUser(new Headers())
    expect(getSession).toHaveBeenCalledTimes(2)
  })
})
