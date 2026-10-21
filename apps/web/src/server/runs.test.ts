import { beforeEach, describe, expect, it, vi } from 'vitest'

const transaction = vi.hoisted(() => vi.fn())
vi.mock('@/lib/db', () => ({ db: { transaction } }))
vi.mock('@xo/engine', () => ({ createDrizzleStore: vi.fn(() => ({})) }))

import { RunActiveError, startRun } from './runs'

const input = { chatId: 'c1', userId: 'u1', message: { id: 'm1', parts: [] }, text: 'hi', uploadIds: [], maxRounds: 3 }

beforeEach(() => {
  transaction.mockReset()
})

describe('startRun', () => {
  it('maps the active-run unique violation to RunActiveError', async () => {
    transaction.mockRejectedValue(
      Object.assign(new Error('Failed query'), { cause: new Error('duplicate key value violates unique constraint "runs_one_active_per_chat"') }),
    )
    await expect(startRun(input)).rejects.toBeInstanceOf(RunActiveError)
  })

  it('rethrows other errors', async () => {
    transaction.mockRejectedValue(new Error('boom'))
    await expect(startRun(input)).rejects.toThrow('boom')
  })

  it('returns the run and assistant message id from the transaction', async () => {
    transaction.mockResolvedValue({ id: 'r1' })
    const result = await startRun(input)
    expect(result.run).toEqual({ id: 'r1' })
    expect(result.assistantMessageId).toBeTruthy()
  })
})
