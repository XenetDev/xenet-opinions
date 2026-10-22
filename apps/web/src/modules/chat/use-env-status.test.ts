// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useEnvStatus, type EnvSeed } from './use-env-status'

const NOW = new Date('2026-10-21T10:00:00.000Z')
const inMinutes = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString()
const asFetch = (stub: unknown) => stub as typeof fetch

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})
afterEach(() => {
  vi.useRealTimers()
})

describe('useEnvStatus', () => {
  it('uses the seed without fetching', async () => {
    const stub = vi.fn()
    const { result } = renderHook(() =>
      useEnvStatus('c1', { seed: { envState: 'open', envKeepaliveUntil: inMinutes(12) }, refreshKey: 0, fetch: asFetch(stub) }),
    )
    await act(async () => {})
    expect(result.current).toEqual({ state: 'open', minutesLeft: 12 })
    expect(stub).not.toHaveBeenCalled()
  })

  it('reports none without a seed', () => {
    const { result } = renderHook(() => useEnvStatus('c1', { seed: null, refreshKey: 0, fetch: asFetch(vi.fn()) }))
    expect(result.current).toEqual({ state: 'none', minutesLeft: null })
  })

  it('refetches the run when the refresh key changes', async () => {
    const stub = vi.fn(async () => Response.json({ status: 'done', envState: 'closed', envKeepaliveUntil: null }))
    const { result, rerender } = renderHook(
      ({ refreshKey }) =>
        useEnvStatus('c1', { seed: { envState: 'open', envKeepaliveUntil: inMinutes(5) }, refreshKey, fetch: asFetch(stub) }),
      { initialProps: { refreshKey: 0 } },
    )
    rerender({ refreshKey: 1 })
    await act(async () => {})
    expect(stub).toHaveBeenCalledWith('/api/chats/c1/run', expect.anything())
    expect(result.current).toEqual({ state: 'closed', minutesLeft: null })
  })

  it('ticks down and flips to closed once the deadline passes', async () => {
    const { result } = renderHook(() =>
      useEnvStatus('c1', { seed: { envState: 'open', envKeepaliveUntil: inMinutes(1) }, refreshKey: 0, fetch: asFetch(vi.fn()) }),
    )
    expect(result.current).toEqual({ state: 'open', minutesLeft: 1 })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(result.current).toEqual({ state: 'open', minutesLeft: 1 })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(result.current).toEqual({ state: 'closed', minutesLeft: null })
  })

  it('adopts a changed seed without fetching', () => {
    const stub = vi.fn()
    const { result, rerender } = renderHook(
      ({ seed }) => useEnvStatus('c1', { seed, refreshKey: 0, fetch: asFetch(stub) }),
      { initialProps: { seed: { envState: 'none', envKeepaliveUntil: null } as EnvSeed } },
    )
    expect(result.current).toEqual({ state: 'none', minutesLeft: null })
    rerender({ seed: { envState: 'open', envKeepaliveUntil: inMinutes(8) } })
    expect(result.current).toEqual({ state: 'open', minutesLeft: 8 })
    expect(stub).not.toHaveBeenCalled()
  })
})
