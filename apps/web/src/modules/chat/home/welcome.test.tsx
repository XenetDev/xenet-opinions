// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { axe } from '@/test/axe'
import { relativeTime, Welcome } from './welcome'

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

describe('relativeTime', () => {
  const now = new Date(2026, 9, 28, 15, 0)
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString()
  it.each([
    [ago(20_000), 'just now'],
    [ago(5 * 60_000), '5 min'],
    [ago(3 * 3_600_000), '3 h'],
    [new Date(2026, 9, 27, 9, 0).toISOString(), 'Yesterday'],
    [
      new Date(2026, 9, 25, 9, 0).toISOString(),
      new Date(2026, 9, 25).toLocaleDateString(undefined, { weekday: 'long' }),
    ],
    [
      new Date(2026, 8, 2, 9, 0).toISOString(),
      new Date(2026, 8, 2).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    ],
  ])('formats %s as %s', (iso, label) => {
    expect(relativeTime(iso, now)).toBe(label)
  })

  it('says Yesterday for a time past midnight even when under 24 hours', () => {
    expect(relativeTime(new Date(2026, 9, 27, 23, 0).toISOString(), new Date(2026, 9, 28, 1, 0))).toBe('Yesterday')
  })
})
