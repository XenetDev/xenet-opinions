// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { axe } from '@/test/axe'
import { SimulationFeed } from './simulation-feed'

afterEach(cleanup)

const posts = [
  { id: '1', platform: 'twitter' as const, agent: 'ada', content: 'tweet one', round: 1 },
  { id: '2', platform: 'twitter' as const, agent: 'bob', content: 'tweet two', round: 1 },
  { id: '3', platform: 'reddit' as const, agent: 'cy', content: 'reddit one', round: 2 },
]

describe('SimulationFeed', () => {
  it('shows round progress and twitter posts by default', () => {
    render(<SimulationFeed data={{ round: 2, totalRounds: 10, twitterActs: 2, redditActs: 1, posts }} />)
    expect(screen.getByText('Round 2 of 10')).toBeTruthy()
    expect(screen.getAllByTestId('feed-post')).toHaveLength(2)
  })

  it('switches to reddit posts', () => {
    render(<SimulationFeed data={{ round: 2, totalRounds: 10, twitterActs: 2, redditActs: 1, posts }} />)
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Reddit/ }))
    expect(screen.getAllByTestId('feed-post')).toHaveLength(1)
    expect(screen.getByText('reddit one')).toBeTruthy()
  })

  it('caps each tab at the last 50 posts', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      id: String(i),
      platform: 'twitter' as const,
      agent: 'a',
      content: `post ${i}`,
      round: 1,
    }))
    render(<SimulationFeed data={{ round: 1, totalRounds: 2, twitterActs: 60, redditActs: 0, posts: many }} />)
    expect(screen.getAllByTestId('feed-post')).toHaveLength(50)
    expect(screen.getByText('post 59')).toBeTruthy()
    expect(screen.queryByText('post 0')).toBeNull()
  })
  it('announces the round counter politely', () => {
    render(<SimulationFeed data={{ round: 2, totalRounds: 10, twitterActs: 2, redditActs: 1, posts }} />)
    expect(screen.getByText('Round 2 of 10').closest('[aria-live]')?.getAttribute('aria-live')).toBe('polite')
  })

  it('has no axe violations', async () => {
    const { container } = render(
      <SimulationFeed data={{ round: 2, totalRounds: 10, twitterActs: 2, redditActs: 1, posts }} />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
