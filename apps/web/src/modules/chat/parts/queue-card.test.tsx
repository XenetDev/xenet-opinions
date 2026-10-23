// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { QueueCard } from './queue-card'

afterEach(cleanup)

describe('QueueCard', () => {
  it('shows the position in the queue', () => {
    render(<QueueCard data={{ position: 3 }} />)
    expect(screen.getByText('You are #3 in the queue')).toBeTruthy()
  })
})
