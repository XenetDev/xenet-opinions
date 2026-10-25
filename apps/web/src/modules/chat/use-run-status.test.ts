// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatListProvider, useChatList } from '@/modules/sidebar/chat-list-context'
import { useRunStatus } from './use-run-status'

const reply = (body: unknown) => vi.fn(async () => Response.json(body))
const asFetch = (stub: unknown) => stub as typeof fetch

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('useRunStatus', () => {
  it('polls immediately and at the interval while running', async () => {
    const stub = reply({ status: 'running', stage: 'ontology', runId: 'r1', assistantMessageId: 'a1' })
    const { result } = renderHook(() => useRunStatus('c1', { enabled: true, intervalMs: 1000, fetch: asFetch(stub) }))
    await act(async () => {})
    expect(stub).toHaveBeenCalledTimes(1)
    expect(stub).toHaveBeenCalledWith('/api/chats/c1/run', expect.anything())
    expect(result.current).toMatchObject({
      status: 'running',
      stage: 'ontology',
      runId: 'r1',
      assistantMessageId: 'a1',
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(stub).toHaveBeenCalledTimes(3)
  })

  it('stops polling once the run is done', async () => {
    const stub = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ status: 'running' }))
      .mockResolvedValue(Response.json({ status: 'done' }))
    const { result } = renderHook(() => useRunStatus('c1', { enabled: true, intervalMs: 1000, fetch: asFetch(stub) }))
    await act(async () => {})
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(result.current.status).toBe('done')
    const calls = stub.mock.calls.length
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(stub).toHaveBeenCalledTimes(calls)
  })

  it('never fetches when disabled', async () => {
    const stub = reply({ status: 'running' })
    const { result } = renderHook(() => useRunStatus('c1', { enabled: false, intervalMs: 1000, fetch: asFetch(stub) }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(stub).not.toHaveBeenCalled()
    expect(result.current.status).toBe('none')
  })

  it('keeps the previous status when a fetch fails', async () => {
    const stub = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ status: 'running' }))
      .mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => useRunStatus('c1', { enabled: true, intervalMs: 1000, fetch: asFetch(stub) }))
    await act(async () => {})
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(stub.mock.calls.length).toBeGreaterThan(1)
    expect(result.current.status).toBe('running')
  })

  it('does not stop early on a stale none before the run appears', async () => {
    const stub = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ status: 'none' }))
      .mockResolvedValueOnce(Response.json({ status: 'running', runId: 'r1' }))
      .mockResolvedValueOnce(Response.json({ status: 'done', runId: 'r1' }))
      .mockResolvedValue(Response.json({ status: 'done', runId: 'r1' }))
    const { result } = renderHook(() => useRunStatus('c1', { enabled: true, intervalMs: 1000, fetch: asFetch(stub) }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000)
    })
    expect(result.current.status).toBe('done')
    expect(stub).toHaveBeenCalledTimes(3)
  })

  it('gives up after six stale polls of the previous terminal run', async () => {
    const stub = reply({ status: 'failed', runId: 'old' })
    const { result } = renderHook(() => useRunStatus('c1', { enabled: true, intervalMs: 1000, fetch: asFetch(stub) }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000)
    })
    expect(stub).toHaveBeenCalledTimes(6)
    expect(result.current.status).toBe('failed')
  })

  it('follows a new run after a stale terminal baseline', async () => {
    const stub = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ status: 'failed', runId: 'old' }))
      .mockResolvedValueOnce(Response.json({ status: 'running', runId: 'new' }))
      .mockResolvedValue(Response.json({ status: 'done', runId: 'new' }))
    const { result } = renderHook(() => useRunStatus('c1', { enabled: true, intervalMs: 1000, fetch: asFetch(stub) }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000)
    })
    expect(result.current).toMatchObject({ status: 'done', runId: 'new' })
    expect(stub).toHaveBeenCalledTimes(3)
  })

  it('restarts a stopped poll when sendCount changes', async () => {
    const stub = reply({ status: 'done', runId: 'r1' })
    const { rerender } = renderHook(
      ({ sendCount }) => useRunStatus('c1', { enabled: true, intervalMs: 1000, sendCount, fetch: asFetch(stub) }),
      { initialProps: { sendCount: 0 } },
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000)
    })
    const before = stub.mock.calls.length
    rerender({ sendCount: 1 })
    await act(async () => {})
    expect(stub.mock.calls.length).toBe(before + 1)
  })

  it('pushes the terminal status into the sidebar chat list', async () => {
    const stub = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ status: 'running' }))
      .mockResolvedValue(Response.json({ status: 'cancelled' }))
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(ChatListProvider, { chats: [{ id: 'c1', title: 'T', runStatus: 'running' }], children })
    const { result } = renderHook(
      () => ({
        run: useRunStatus('c1', { enabled: true, intervalMs: 1000, fetch: asFetch(stub) }),
        list: useChatList(),
      }),
      { wrapper },
    )
    await act(async () => {})
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(result.current.run.status).toBe('cancelled')
    expect(result.current.list.chats).toEqual([{ id: 'c1', title: 'T', runStatus: 'cancelled' }])
  })
})
