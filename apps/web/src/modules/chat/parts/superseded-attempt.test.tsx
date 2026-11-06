// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SupersededAttempt } from './superseded-attempt'

afterEach(cleanup)

const failed = [
  {
    type: 'data-error' as const,
    data: { stage: 'sim_run' as const, code: 'env_stuck', message: 'The simulation environment did not close in time' },
  },
]

describe('SupersededAttempt', () => {
  it('collapses a retried attempt to one line with the reason, and expands on click', () => {
    render(
      <SupersededAttempt parts={failed}>
        <p>Personas list</p>
      </SupersededAttempt>,
    )
    const trigger = screen.getByRole('button', {
      name: 'Earlier attempt stopped: The simulation environment did not close in time. Retried below.',
    })
    expect(screen.queryByText('Personas list')).toBeNull()
    fireEvent.click(trigger)
    expect(screen.getByText('Personas list')).toBeTruthy()
  })
})
