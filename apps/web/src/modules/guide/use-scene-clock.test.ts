// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSceneClock } from './use-scene-clock'

const STEPS = [100, 200, 300]

function stubReducedMotion(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useSceneClock', () => {
  it('advances one phase per step and loops', () => {
    const { result } = renderHook(() => useSceneClock({ active: true, steps: STEPS }))
    expect(result.current).toBe(0)
    act(() => vi.advanceTimersByTime(100))
    expect(result.current).toBe(1)
    act(() => vi.advanceTimersByTime(199))
    expect(result.current).toBe(1)
    act(() => vi.advanceTimersByTime(1))
    expect(result.current).toBe(2)
    act(() => vi.advanceTimersByTime(300))
    expect(result.current).toBe(0)
  })

  it('advances through phases that share a duration', () => {
    const { result } = renderHook(() => useSceneClock({ active: true, steps: [50, 50, 50] }))
    act(() => vi.advanceTimersByTime(50))
    act(() => vi.advanceTimersByTime(50))
    expect(result.current).toBe(2)
  })

  it('resets to the first phase and schedules nothing while inactive', () => {
    const { result, rerender } = renderHook(({ active }) => useSceneClock({ active, steps: STEPS }), {
      initialProps: { active: true },
    })
    act(() => vi.advanceTimersByTime(150))
    expect(result.current).toBe(1)
    rerender({ active: false })
    expect(result.current).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
    act(() => vi.advanceTimersByTime(1000))
    expect(result.current).toBe(0)
  })

  it('returns the final phase without timers when reduced motion is preferred', () => {
    stubReducedMotion(true)
    const { result } = renderHook(() => useSceneClock({ active: true, steps: STEPS }))
    expect(result.current).toBe(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('animates when reduced motion is not preferred', () => {
    stubReducedMotion(false)
    const { result } = renderHook(() => useSceneClock({ active: true, steps: STEPS }))
    act(() => vi.advanceTimersByTime(100))
    expect(result.current).toBe(1)
  })

  it('follows reduced-motion changes while mounted', () => {
    const media = { matches: false, listeners: new Set<() => void>() }
    vi.stubGlobal('matchMedia', (query: string) => ({
      get matches() {
        return media.matches
      },
      media: query,
      addEventListener: (_: string, listener: () => void) => media.listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => media.listeners.delete(listener),
    }))
    const change = (matches: boolean) => {
      media.matches = matches
      act(() => {
        for (const listener of media.listeners) listener()
      })
    }
    const { result } = renderHook(() => useSceneClock({ active: true, steps: STEPS }))
    expect(result.current).toBe(0)
    expect(vi.getTimerCount()).toBe(1)

    change(true)
    expect(result.current).toBe(2)
    expect(vi.getTimerCount()).toBe(0)

    change(false)
    expect(result.current).toBe(0)
    expect(vi.getTimerCount()).toBe(1)
    act(() => vi.advanceTimersByTime(100))
    expect(result.current).toBe(1)
  })

  it('clears its timer on unmount', () => {
    const { unmount } = renderHook(() => useSceneClock({ active: true, steps: STEPS }))
    expect(vi.getTimerCount()).toBe(1)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
