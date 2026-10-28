import { describe, expect, it, vi } from 'vitest'

const select = vi.hoisted(() => vi.fn())
vi.mock('@/lib/db', () => ({ db: { select } }))
vi.mock('@/lib/storage', () => ({ storage: {} }))
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  cache: <A, R>(fn: (arg: A) => R) => {
    const memo = new Map<A, R>()
    return (arg: A) => {
      if (!memo.has(arg)) memo.set(arg, fn(arg))
      return memo.get(arg) as R
    }
  },
}))

import { listChats } from './chats'

describe('listChats', () => {
  it('queries once per user within a request', async () => {
    const orderBy = vi.fn(async () => [
      { id: 'c1', title: 't', updatedAt: new Date(), runStatus: 'none', firstFile: null },
    ])
    select.mockReturnValue({ from: () => ({ where: () => ({ orderBy }) }) })
    expect(await listChats('u1')).toEqual([expect.objectContaining({ id: 'c1' })])
    await listChats('u1')
    expect(select).toHaveBeenCalledTimes(1)
    await listChats('u2')
    expect(select).toHaveBeenCalledTimes(2)
  })
})
