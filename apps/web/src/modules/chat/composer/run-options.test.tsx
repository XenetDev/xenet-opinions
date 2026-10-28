// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { defaultRounds, PauseToggle, RoundsPicker, roundsLabel } from './run-options'

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

  it('offers every round up to maxRounds and reports the pick', () => {
    const onChange = vi.fn()
    render(<RoundsPicker value={3} onChange={onChange} maxRounds={4} />)
    fireEvent.keyDown(screen.getByRole('button', { name: '3 rounds' }), { key: 'Enter' })
    expect(screen.getAllByRole('menuitemradio').map((item) => item.textContent)).toEqual([
      '1 round',
      '2 rounds',
      '3 rounds',
      '4 rounds',
    ])
    expect(screen.getByRole('menuitemradio', { name: '3 rounds' }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('menuitemradio', { name: '4 rounds' }))
    expect(onChange).toHaveBeenCalledWith(4)
  })

  it('reports the flipped pause state and marks it pressed', () => {
    const onChange = vi.fn()
    const { rerender } = render(<PauseToggle checked={false} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Pause for interviews' }))
    expect(onChange).toHaveBeenCalledWith(true)
    rerender(<PauseToggle checked onChange={onChange} />)
    const chip = screen.getByRole('button', { name: 'Pause for interviews' })
    expect(chip.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(chip)
    expect(onChange).toHaveBeenLastCalledWith(false)
  })
})
