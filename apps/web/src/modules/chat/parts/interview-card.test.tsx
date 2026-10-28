// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { axe } from '@/test/axe'
import { InterviewCard } from './interview-card'

afterEach(cleanup)

const base = { id: 'i1', questionId: 'q1', agentId: 'a', agentName: 'Ada Lovelace', question: 'What do you think?' }

describe('InterviewCard', () => {
  it('is a persona message with avatar initials', () => {
    render(<InterviewCard data={{ ...base, status: 'done', answer: 'I like it' }} />)
    const message = screen.getByRole('group', { name: 'Ada Lovelace' })
    expect(message.getAttribute('data-slot')).toBe('message')
    expect(message.getAttribute('data-status')).toBe('done')
    expect(message.querySelector('[data-slot="message-avatar"]')?.textContent).toBe('AL')
  })

  it('shows name and question while pending, with a spinner and a Thinking shimmer', () => {
    render(<InterviewCard data={{ ...base, status: 'pending' }} />)
    expect(screen.getByText('Ada Lovelace')).toBeTruthy()
    expect(screen.getByText('What do you think?')).toBeTruthy()
    const pending = screen.getByTestId('interview-pending')
    expect(pending.querySelector('[data-slot="spinner"]')?.getAttribute('class')).toContain(
      'motion-reduce:animate-none',
    )
    expect(screen.getByText('Thinking').className).toContain('shimmer')
  })

  it('renders the answer in a ghost bubble when done', () => {
    render(<InterviewCard data={{ ...base, status: 'done', answer: 'I like it' }} />)
    expect(screen.getByText('I like it').closest('[data-slot="bubble"]')?.getAttribute('data-variant')).toBe('ghost')
    expect(screen.queryByTestId('interview-pending')).toBeNull()
    expect(screen.getByText('I like it').closest('[data-slot="bubble-content"]')?.className.split(' ')).toEqual(
      expect.arrayContaining(['text-sm/6', 'sm:text-[15px]/6']),
    )
  })

  it('renders an alert when failed', () => {
    render(<InterviewCard data={{ ...base, status: 'failed', error: 'Agent unreachable' }} />)
    expect(screen.getByRole('alert').textContent).toContain('Agent unreachable')
  })

  it('hides the question when the group shows it', () => {
    render(<InterviewCard data={{ ...base, status: 'pending' }} showQuestion={false} />)
    expect(screen.queryByText('What do you think?')).toBeNull()
  })

  it('has no axe violations', async () => {
    const { container } = render(
      <>
        <InterviewCard data={{ ...base, status: 'pending' }} />
        <InterviewCard data={{ ...base, status: 'done', answer: 'I like it' }} />
        <InterviewCard data={{ ...base, status: 'failed', error: 'Agent unreachable' }} />
      </>,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
