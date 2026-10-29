// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Thinking } from './thinking'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Thinking', () => {
  it('shows the label and counts elapsed time', () => {
    vi.useFakeTimers()
    render(<Thinking />)
    expect(screen.getByRole('status').textContent).toBe('Thinking0.0s')
    act(() => vi.advanceTimersByTime(1500))
    expect(screen.getByRole('status').textContent).toBe('Thinking1.5s')
  })

  it('switches to minutes after a minute', () => {
    vi.useFakeTimers()
    render(<Thinking label="Reading" />)
    act(() => vi.advanceTimersByTime(61_000))
    expect(screen.getByRole('status').textContent).toBe('Reading1m 1.0s')
  })
})
