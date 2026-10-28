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

const roster = {
  count: 2,
  profiles: [
    { id: '22', name: 'Ada Lovelace', role: 'Analyst', topics: [] },
    { id: '5', name: 'Bob Stone', topics: [] },
  ],
}

describe('SimulationFeed', () => {
  it('shows round progress and twitter posts by default', () => {
    render(<SimulationFeed data={{ round: 2, totalRounds: 10, twitterActs: 2, redditActs: 1, posts }} />)
    expect(screen.getByText('Round 2 of 10')).toBeTruthy()
    expect(screen.getAllByTestId('feed-post')).toHaveLength(2)
  })

  it('puts the round and platform tabs in the frame header and posts in outline bubbles with initials', () => {
    render(<SimulationFeed data={{ round: 2, totalRounds: 10, twitterActs: 2, redditActs: 1, posts }} />)
    const header = screen.getByText('Round 2 of 10').closest('[data-slot="frame-panel-header"]') as HTMLElement
    expect(header).not.toBeNull()
    expect(header.querySelectorAll('[role="tab"]')).toHaveLength(2)
    const post = screen.getAllByTestId('feed-post')[0]!
    expect(post.querySelector('[data-slot="bubble"]')?.getAttribute('data-variant')).toBe('outline')
    expect(post.querySelector('[data-slot="message-avatar"]')?.textContent).toBe('PA')
    expect(post.textContent).toContain('tweet one')
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
  it('leaves round announcements to the console live row', () => {
    const { container } = render(
      <SimulationFeed data={{ round: 2, totalRounds: 10, twitterActs: 2, redditActs: 1, posts }} />,
    )
    expect(screen.getByText('Round 2 of 10')).toBeTruthy()
    expect(container.querySelector('[aria-live]')).toBeNull()
  })

  it('titles the card as a simulated feed with a round badge and an explanation', () => {
    render(<SimulationFeed data={{ round: 2, totalRounds: 10, twitterActs: 2, redditActs: 1, posts }} />)
    const header = screen.getByText('Simulated feed').closest('[data-slot="frame-panel-header"]') as HTMLElement
    expect(header).not.toBeNull()
    expect(screen.getByText('Round 2 of 10').closest('[data-slot="badge"]')).not.toBeNull()
    expect(
      screen.getByText(
        'Personas post and reply to each other on a simulated X.com and Reddit.com. Nothing here comes from the real sites.',
      ),
    ).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'X.com · 2' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Reddit.com · 1' })).toBeTruthy()
  })

  it('resolves authors by persona id, by name, and falls back to Persona N', () => {
    const data = {
      round: 1,
      totalRounds: 2,
      twitterActs: 3,
      redditActs: 0,
      posts: [
        { id: 'a', platform: 'twitter' as const, agent: '22', content: 'by id', round: 1 },
        { id: 'b', platform: 'twitter' as const, agent: 'Bob Stone', content: 'by name', round: 1 },
        { id: 'c', platform: 'twitter' as const, agent: '99', content: 'unknown', round: 1 },
      ],
    }
    render(<SimulationFeed data={data} agents={roster} />)
    const [byId, byName, unknown] = screen.getAllByTestId('feed-post')
    expect(byId?.querySelector('[data-slot="message-header"]')?.textContent).toBe('Ada Lovelace · Analyst · round 1')
    expect(byId?.querySelector('[data-slot="message-avatar"]')?.textContent).toBe('AL')
    expect(byName?.querySelector('[data-slot="message-header"]')?.textContent).toBe('Bob Stone · round 1')
    expect(unknown?.querySelector('[data-slot="message-header"]')?.textContent).toBe('Persona 99 · round 1')
    expect(unknown?.querySelector('[data-slot="message-avatar"]')?.textContent).toBe('P9')
  })

  it('nests replies under their post, shows three, and expands the rest', () => {
    const replies = Array.from({ length: 5 }, (_, i) => ({
      id: `r${i}`,
      postId: '2',
      platform: 'twitter' as const,
      agent: i === 0 ? '22' : '7',
      content: `reply ${i}`,
      round: 1,
    }))
    render(
      <SimulationFeed
        data={{ round: 2, totalRounds: 10, twitterActs: 2, redditActs: 1, posts, replies }}
        agents={roster}
      />,
    )
    const [first, second] = screen.getAllByTestId('feed-post')
    expect(first?.querySelectorAll('[data-testid="feed-reply"]')).toHaveLength(0)
    const shown = second?.querySelectorAll('[data-testid="feed-reply"]')
    expect(shown).toHaveLength(3)
    expect(shown?.[0]?.querySelector('[data-slot="message-header"]')?.textContent).toBe('Ada Lovelace · replied')
    expect(shown?.[1]?.querySelector('[data-slot="message-header"]')?.textContent).toBe('Persona 7 · replied')
    expect(screen.queryByText('reply 4')).toBeNull()
    const more = screen.getByRole('button', { name: '+2 more replies' })
    expect(more.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(more)
    expect(second?.querySelectorAll('[data-testid="feed-reply"]')).toHaveLength(5)
    expect(screen.getByText('reply 4')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /more replies/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Show fewer replies' }).getAttribute('aria-expanded')).toBe('true')
  })

  it('ignores replies whose post is not listed and renders feeds without replies', () => {
    const replies = [
      { id: 'r1', postId: 'missing', platform: 'twitter' as const, agent: '22', content: 'orphan', round: 1 },
      { id: 'r2', postId: '3', platform: 'reddit' as const, agent: '22', content: 'reddit reply', round: 2 },
    ]
    render(
      <SimulationFeed
        data={{ round: 2, totalRounds: 10, twitterActs: 2, redditActs: 1, posts, replies }}
        agents={roster}
      />,
    )
    expect(screen.queryByText('orphan')).toBeNull()
    expect(screen.queryAllByTestId('feed-reply')).toHaveLength(0)
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Reddit/ }))
    expect(screen.getAllByTestId('feed-reply')).toHaveLength(1)
  })

  it('has no axe violations with replies', async () => {
    const replies = Array.from({ length: 4 }, (_, i) => ({
      id: `r${i}`,
      postId: '1',
      platform: 'twitter' as const,
      agent: '22',
      content: `reply ${i}`,
      round: 1,
    }))
    const { container } = render(
      <SimulationFeed
        data={{ round: 2, totalRounds: 10, twitterActs: 2, redditActs: 1, posts, replies }}
        agents={roster}
      />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no axe violations', async () => {
    const { container } = render(
      <SimulationFeed data={{ round: 2, totalRounds: 10, twitterActs: 2, redditActs: 1, posts }} />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
