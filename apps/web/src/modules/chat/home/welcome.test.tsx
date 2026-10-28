// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { axe } from '@/test/axe'
import { Welcome } from './welcome'

afterEach(cleanup)

const STARTERS = [
  'How will customers react to a 20% price increase on our Pro plan?',
  'What happens to public opinion if the city bans e-scooters downtown?',
  'How would employees respond to a return-to-office mandate?',
]

const recent = [
  { id: 'a', title: 'Price increase', updatedAt: new Date().toISOString(), firstFile: 'pricing.pdf' },
  { id: 'b', title: 'Scooter ban', updatedAt: new Date(Date.now() - 3 * 86_400_000).toISOString() },
  { id: 'c', title: 'Office mandate', updatedAt: new Date().toISOString() },
  { id: 'd', title: 'Fourth', updatedAt: new Date().toISOString() },
  { id: 'e', title: 'Fifth', updatedAt: new Date().toISOString() },
]

describe('Welcome', () => {
  it('shows the heading, the line and three starter rows that fill without fetching', () => {
    const fetchStub = vi.fn()
    vi.stubGlobal('fetch', fetchStub)
    const onUseStarter = vi.fn()
    render(<Welcome recent={[]} onUseStarter={onUseStarter} />)
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
    vi.unstubAllGlobals()
  })

  it('lists at most four recent chats with title, file badge, time and link', () => {
    render(<Welcome recent={recent} onUseStarter={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Recent chats' })).toBeTruthy()
    const links = screen.getAllByRole('link')
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/c/a', '/c/b', '/c/c', '/c/d'])
    expect(screen.queryByText('Fifth')).toBeNull()
    const first = links[0]!
    expect(within(first).getByText('Price increase')).toBeTruthy()
    expect(within(first).getByText('pricing.pdf').closest('[data-slot="badge"]')).toBeTruthy()
    expect(within(first).getByText('just now').className).toContain('w-14')
    expect(links[1]!.querySelector('[data-slot="badge"]')).toBeNull()
  })

  it('has no axe violations', async () => {
    const { container } = render(<Welcome recent={recent} onUseStarter={vi.fn()} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
