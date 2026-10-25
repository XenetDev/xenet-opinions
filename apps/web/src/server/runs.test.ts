import { beforeEach, describe, expect, it, vi } from 'vitest'

const transaction = vi.hoisted(() => vi.fn())
vi.mock('@/lib/db', () => ({ db: { transaction } }))
const store = vi.hoisted(() => ({ getActiveByChat: vi.fn(), getLatestByChat: vi.fn() }))
const cancelRun = vi.hoisted(() => vi.fn())
const materialiseRun = vi.hoisted(() => vi.fn())
vi.mock('@xo/engine', () => ({ createDrizzleStore: vi.fn(() => store), cancelRun, materialiseRun }))

import { cancelActiveRun, RunActiveError, RunNotActiveError, RunNotFoundError, startRun } from './runs'

const input = { chatId: 'c1', userId: 'u1', message: { id: 'm1', parts: [] }, text: 'hi', uploadIds: [], maxRounds: 3 }

beforeEach(() => {
  vi.resetAllMocks()
})

describe('startRun', () => {
  it('maps the active-run unique violation to RunActiveError', async () => {
    transaction.mockRejectedValue(
      Object.assign(new Error('Failed query'), {
        cause: new Error('duplicate key value violates unique constraint "runs_one_active_per_chat"'),
      }),
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

describe('cancelActiveRun', () => {
  it('cancels then materialises the run', async () => {
    store.getActiveByChat.mockResolvedValue({ id: 'r1' })
    cancelRun.mockResolvedValue({ id: 'r1', status: 'cancelled' })
    materialiseRun.mockResolvedValue([])
    expect(await cancelActiveRun('c1')).toEqual({ id: 'r1', status: 'cancelled' })
    expect(cancelRun).toHaveBeenCalledWith(store, 'r1', expect.any(Date))
    expect(materialiseRun).toHaveBeenCalledWith(store, 'r1')
    expect(cancelRun.mock.invocationCallOrder[0]).toBeLessThan(materialiseRun.mock.invocationCallOrder[0]!)
  })

  it('still returns the cancelled run when materialise fails', async () => {
    store.getActiveByChat.mockResolvedValue({ id: 'r1' })
    cancelRun.mockResolvedValue({ id: 'r1', status: 'cancelled' })
    materialiseRun.mockRejectedValue(new Error('boom'))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await cancelActiveRun('c1')).toEqual({ id: 'r1', status: 'cancelled' })
    error.mockRestore()
  })

  it('maps a run that finished in between to RunNotActiveError without materialising', async () => {
    store.getActiveByChat.mockResolvedValue({ id: 'r1' })
    cancelRun.mockRejectedValue(new Error('run_not_active'))
    await expect(cancelActiveRun('c1')).rejects.toBeInstanceOf(RunNotActiveError)
    expect(materialiseRun).not.toHaveBeenCalled()
  })

  it('distinguishes a terminal latest run from no run at all', async () => {
    store.getActiveByChat.mockResolvedValue(null)
    store.getLatestByChat.mockResolvedValue({ id: 'r1', status: 'done' })
    await expect(cancelActiveRun('c1')).rejects.toBeInstanceOf(RunNotActiveError)
    store.getLatestByChat.mockResolvedValue(null)
    await expect(cancelActiveRun('c1')).rejects.toBeInstanceOf(RunNotFoundError)
  })
})
