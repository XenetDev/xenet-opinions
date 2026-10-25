// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { InterviewSelectionProvider, useInterviewSelection } from './interview-selection'

afterEach(cleanup)

const wrap =
  (props: { enabled: boolean; max?: number }) =>
  ({ children }: { children: ReactNode }) => (
    <InterviewSelectionProvider {...props}>{children}</InterviewSelectionProvider>
  )

describe('useInterviewSelection', () => {
  it('is null outside a provider', () => {
    const { result } = renderHook(() => useInterviewSelection())
    expect(result.current).toBeNull()
  })

  it('toggles, removes and clears', () => {
    const { result } = renderHook(() => useInterviewSelection(), { wrapper: wrap({ enabled: true }) })
    let outcome: string | undefined
    act(() => {
      outcome = result.current!.toggle({ id: 'a', name: 'Ada' })
    })
    expect(outcome).toBe('added')
    expect(result.current!.isSelected('a')).toBe(true)
    expect(result.current!.selected).toEqual([{ id: 'a', name: 'Ada' }])
    act(() => {
      outcome = result.current!.toggle({ id: 'a', name: 'Ada' })
    })
    expect(outcome).toBe('removed')
    act(() => {
      result.current!.toggle({ id: 'a', name: 'Ada' })
      result.current!.toggle({ id: 'b', name: 'Bo' })
    })
    act(() => result.current!.remove('a'))
    expect(result.current!.selected.map((p) => p.id)).toEqual(['b'])
    act(() => result.current!.clear())
    expect(result.current!.selected).toEqual([])
  })

  it('returns full at max without adding', () => {
    const { result } = renderHook(() => useInterviewSelection(), { wrapper: wrap({ enabled: true, max: 2 }) })
    act(() => {
      result.current!.toggle({ id: 'a', name: 'A' })
    })
    act(() => {
      result.current!.toggle({ id: 'b', name: 'B' })
    })
    let outcome: string | undefined
    act(() => {
      outcome = result.current!.toggle({ id: 'c', name: 'C' })
    })
    expect(outcome).toBe('full')
    expect(result.current!.selected).toHaveLength(2)
    expect(result.current!.max).toBe(2)
  })

  it('clears the selection when disabled', () => {
    const { result, rerender } = renderHook(() => useInterviewSelection(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <InterviewSelectionProvider enabled={flag.value}>{children}</InterviewSelectionProvider>
      ),
    })
    act(() => {
      result.current!.toggle({ id: 'a', name: 'A' })
    })
    flag.value = false
    rerender()
    expect(result.current!.selected).toEqual([])
  })
})

const flag = { value: true }
