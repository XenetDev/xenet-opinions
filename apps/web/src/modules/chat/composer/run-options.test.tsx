// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { defaultRounds, PauseRow, RoundsRow, roundsLabel } from './run-options'

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

afterEach(cleanup)

describe('run options', () => {
  it('labels rounds in the singular and plural', () => {
    expect(roundsLabel(1)).toBe('1 round')
    expect(roundsLabel(3)).toBe('3 rounds')
  })

  it('caps the default rounds at the limit', () => {
    expect(defaultRounds(40)).toBe(3)
    expect(defaultRounds(2)).toBe(2)
  })

  it('offers every round up to maxRounds in a labelled select and reports the pick', () => {
    const onChange = vi.fn()
    render(<RoundsRow value={3} onChange={onChange} maxRounds={4} />)
    const select = screen.getByRole('combobox', { name: 'Rounds' })
    expect(select.textContent).toBe('3 rounds')
    fireEvent.keyDown(select, { key: 'Enter' })
    expect(screen.getAllByRole('option').map((item) => item.textContent)).toEqual([
      '1 round',
      '2 rounds',
      '3 rounds',
      '4 rounds',
    ])
    fireEvent.click(screen.getByRole('option', { name: '4 rounds' }))
    expect(onChange).toHaveBeenCalledWith(4)
  })

  it('reports the flipped pause state from a labelled switch', () => {
    const onChange = vi.fn()
    const { rerender } = render(<PauseRow checked={false} onChange={onChange} />)
    fireEvent.click(screen.getByRole('switch', { name: 'Pause for interviews' }))
    expect(onChange).toHaveBeenCalledWith(true)
    rerender(<PauseRow checked onChange={onChange} />)
    const toggle = screen.getByRole('switch', { name: 'Pause for interviews' })
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(toggle)
    expect(onChange).toHaveBeenLastCalledWith(false)
  })
})
