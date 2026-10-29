// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { axe } from '@/test/axe'
import { Welcome } from './welcome'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const STARTERS = [
  'How will customers react to a 20% price increase on our Pro plan?',
  'What happens to public opinion if the city bans e-scooters downtown?',
  'How would employees respond to a return-to-office mandate?',
]

describe('Welcome', () => {
  it('shows the heading, the line and three starter rows that fill without fetching', () => {
    const fetchStub = vi.fn()
    vi.stubGlobal('fetch', fetchStub)
    const onUseStarter = vi.fn()
    render(<Welcome onUseStarter={onUseStarter} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Xenet Opinions' })).toBeTruthy()
    expect(screen.getByText('Ask how a group of people would react to a decision.')).toBeTruthy()
    const buttons = screen.getAllByRole('button')
    expect(buttons.map((button) => button.textContent)).toEqual(STARTERS)
    for (const button of buttons) expect(button.querySelector('svg.lucide-corner-down-left')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: STARTERS[2] }))
    expect(onUseStarter).toHaveBeenCalledWith(STARTERS[2])
    expect(fetchStub).not.toHaveBeenCalled()
    expect(screen.queryByRole('heading', { name: 'Recent chats' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Start' })).toBeNull()
    for (const button of buttons) expect(button.className).toContain('dark:hover:bg-transparent')
  })

  it('has no axe violations', async () => {
    const { container } = render(<Welcome onUseStarter={vi.fn()} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
