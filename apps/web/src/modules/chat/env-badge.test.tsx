// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { EnvBadge } from './env-badge'

afterEach(cleanup)

describe('EnvBadge', () => {
  it('shows the minutes left while open', () => {
    render(<EnvBadge state="open" minutesLeft={7} />)
    expect(screen.getByRole('status').textContent).toBe('Agents available for 7 min')
  })

  it('shows offline when closed', () => {
    render(<EnvBadge state="closed" minutesLeft={null} />)
    expect(screen.getByRole('status').textContent).toBe('Agents offline')
  })

  it('renders nothing without an env', () => {
    const { container } = render(<EnvBadge state="none" minutesLeft={null} />)
    expect(container.innerHTML).toBe('')
  })
})
