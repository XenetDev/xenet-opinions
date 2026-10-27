// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { axe } from '@/test/axe'
import { QueueCard } from './queue-card'

afterEach(cleanup)

describe('QueueCard', () => {
  it('shows the position in the queue', () => {
    render(<QueueCard data={{ position: 3 }} />)
    expect(screen.getByText('You are #3 in the queue')).toBeTruthy()
  })
  it('explains a paused run ahead in the queue', () => {
    render(<QueueCard data={{ position: 1, pausedAhead: true }} />)
    expect(
      screen.getByText('You are #1 in the queue. A run is paused for interviews; yours starts when it finishes.'),
    ).toBeTruthy()
  })
  it('has no axe violations', async () => {
    const { container } = render(<QueueCard data={{ position: 3 }} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
