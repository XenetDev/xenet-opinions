// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
    expect(screen.getByText('3 of 12 personas')).toBeTruthy()
    expect(screen.getAllByTestId('agent-card')).toHaveLength(3)
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
})
