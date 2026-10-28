// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { defaultRounds, PauseOption, RoundsPicker, roundsLabel } from './run-options'

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

  it('toggles the pause item without closing the menu', () => {
    const onChange = vi.fn()
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <PauseOption checked={false} onChange={onChange} />
        </DropdownMenuContent>
      </DropdownMenu>,
    )
    fireEvent.keyDown(screen.getByRole('button', { name: 'Open' }), { key: 'Enter' })
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Pause for interviews before the report' }))
    expect(onChange).toHaveBeenCalledWith(true)
    expect(screen.getByRole('menu')).toBeTruthy()
  })
})
