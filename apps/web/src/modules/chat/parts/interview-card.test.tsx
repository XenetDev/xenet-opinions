// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { axe } from '@/test/axe'
import { InterviewCard } from './interview-card'

afterEach(cleanup)

const base = { agentId: 'a', agentName: 'Ada Lovelace', question: 'What do you think?' }

describe('InterviewCard', () => {
  it('shows name and question while pending', () => {
    render(<InterviewCard data={{ ...base, status: 'pending' }} />)
    expect(screen.getByText('Ada Lovelace')).toBeTruthy()
    expect(screen.getByText('What do you think?')).toBeTruthy()
    expect(screen.getByTestId('interview-pending')).toBeTruthy()
  })

  it('renders the answer when done', () => {
    render(<InterviewCard data={{ ...base, status: 'done', answer: 'I like it' }} />)
    expect(screen.getByText('I like it')).toBeTruthy()
    expect(screen.queryByTestId('interview-pending')).toBeNull()
  })

  it('renders an alert when failed', () => {
    render(<InterviewCard data={{ ...base, status: 'failed', error: 'Agent unreachable' }} />)
    expect(screen.getByRole('alert').textContent).toContain('Agent unreachable')
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
