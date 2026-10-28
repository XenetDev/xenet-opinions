// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { axe } from '@/test/axe'
import { Welcome } from './welcome'

afterEach(cleanup)

const recent = [
  { id: 'a', title: 'Price increase', updatedAt: new Date().toISOString() },
  { id: 'b', title: 'Scooter ban', updatedAt: new Date(Date.now() - 3 * 86_400_000).toISOString() },
]

describe('Welcome', () => {
  it('shows the greeting, the three starters and fills on select', () => {
    const onUseStarter = vi.fn()
    render(<Welcome recent={[]} onUseStarter={onUseStarter} />)
    expect(screen.getByRole('heading', { name: 'Xenet Opinions' })).toBeTruthy()
    expect(screen.getByText('Ask how a group of people would react to a decision.')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Start' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Resume' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'How would employees respond to a return-to-office mandate?' }))
    expect(onUseStarter).toHaveBeenCalledWith('How would employees respond to a return-to-office mandate?')
    expect(screen.getAllByRole('button')).toHaveLength(3)
  })

  it('links resume rows to their chats', () => {
    render(<Welcome recent={recent} onUseStarter={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Resume' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Price increase/ }).getAttribute('href')).toBe('/c/a')
    expect(screen.getByRole('link', { name: /Scooter ban/ }).getAttribute('href')).toBe('/c/b')
    expect(screen.getByRole('link', { name: /Price increase/ }).textContent).toContain('just now')
  })

  it('has no axe violations', async () => {
    const { container } = render(<Welcome recent={recent} onUseStarter={vi.fn()} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
