// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { axe } from '@/test/axe'
import { InterviewSelectionProvider } from '../interview-selection'
import { AgentRoster } from './agent-roster'

afterEach(cleanup)

const profiles = [
  { id: 'a', name: 'Ada Lovelace', role: 'Analyst', bio: 'Writes programs', topics: ['math', 'engines'] },
  { id: 'b', name: 'Grace Hopper', topics: [] },
  { id: 'c', name: 'Alan Turing', topics: ['logic'] },
]

describe('AgentRoster', () => {
  it('shows count of expected personas', () => {
    render(<AgentRoster data={{ count: 3, expected: 12, profiles }} />)
    const heading = screen.getByText('3 of 12 personas')
    expect(heading.closest('[data-slot="frame-panel-header"]')).not.toBeNull()
    expect(screen.getAllByTestId('agent-card')).toHaveLength(3)
    for (const card of screen.getAllByTestId('agent-card'))
      expect(card.closest('[data-slot="frame-panel"]')).not.toBeNull()
  })

  it('omits expected when absent', () => {
    render(<AgentRoster data={{ count: 3, profiles }} />)
    expect(screen.getByText('3 personas')).toBeTruthy()
  })

  it('opens a sheet with bio and topics on click', () => {
    render(<AgentRoster data={{ count: 3, profiles }} />)
    fireEvent.click(screen.getAllByTestId('agent-card')[0]!)
    expect(screen.getByText('Writes programs')).toBeTruthy()
    expect(screen.getByText('engines')).toBeTruthy()
  })

  describe('when selection is enabled', () => {
    const renderEnabled = (max?: number) =>
      render(
        <InterviewSelectionProvider enabled max={max}>
          <AgentRoster data={{ count: 3, profiles }} />
        </InterviewSelectionProvider>,
      )

    it('toggles aria-pressed on card click without opening the sheet', () => {
      renderEnabled()
      const card = screen.getAllByTestId('agent-card')[0]!
      expect(card.getAttribute('aria-pressed')).toBe('false')
      fireEvent.click(card)
      expect(card.getAttribute('aria-pressed')).toBe('true')
      expect(screen.queryByText('Writes programs')).toBeNull()
      fireEvent.click(card)
      expect(card.getAttribute('aria-pressed')).toBe('false')
    })

    it('opens the sheet from the details button', () => {
      renderEnabled()
      fireEvent.click(screen.getByRole('button', { name: 'About Ada Lovelace' }))
      expect(screen.getByText('Writes programs')).toBeTruthy()
    })

    it('pads selectable cards so the details button does not cover the name', () => {
      renderEnabled()
      expect(screen.getAllByTestId('agent-card')[0]!.className).toContain('pr-8')
    })

    it('shows a hint when the selection is full', () => {
      renderEnabled(2)
      const cards = screen.getAllByTestId('agent-card')
      fireEvent.click(cards[0]!)
      fireEvent.click(cards[1]!)
      fireEvent.click(cards[2]!)
      expect(screen.getByText('Up to 2 personas per interview')).toBeTruthy()
      expect(cards[2]!.getAttribute('aria-pressed')).toBe('false')
    })
  })
  it('has no axe violations', async () => {
    const { container } = render(
      <InterviewSelectionProvider enabled max={2}>
        <AgentRoster data={{ count: 3, expected: 12, profiles }} />
      </InterviewSelectionProvider>,
    )
    for (const card of screen.getAllByTestId('agent-card')) fireEvent.click(card)
    expect(await axe(container)).toHaveNoViolations()
  })
})
