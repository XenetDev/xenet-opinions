// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { axe } from '@/test/axe'

const dialog = vi.hoisted(() => ({ open: vi.fn() }))

vi.mock('@/modules/auth/sign-in-dialog', () => ({ useSignInDialog: () => dialog }))

import { resetLabel, UsageCard } from './usage-card'
import { UsageProvider } from './usage-context'

const resetAt = '2026-10-29T08:00:00.000Z'

const card = (used: number, signIn?: { max: number }) => (
  <UsageProvider usage={{ used, max: 3, resetAt }} {...(signIn ? { signIn } : {})}>
    <UsageCard />
  </UsageProvider>
)

afterEach(() => {
  cleanup()
  dialog.open.mockReset()
})

describe('UsageCard', () => {
  it('renders nothing without usage', () => {
    const { container } = render(
      <UsageProvider usage={null}>
        <UsageCard />
      </UsageProvider>,
    )
    expect(container.textContent).toBe('')
  })

  it('shows count, reset time and a progress bar', async () => {
    const { container } = render(card(2))
    expect(screen.getByText('Runs today')).toBeTruthy()
    expect(screen.getByText('2 of 3')).toBeTruthy()
    expect(screen.getByText(`Resets ${resetLabel(resetAt)}`)).toBeTruthy()
    const bar = screen.getByRole('progressbar')
    expect(bar.getAttribute('aria-valuenow')).toBe('2')
    expect(bar.getAttribute('aria-valuemax')).toBe('3')
    expect(bar.getAttribute('aria-valuetext') ?? '2').toMatch(/67|2/)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('says when no runs are left', () => {
    render(card(3))
    expect(screen.getByText(`No runs left until ${resetLabel(resetAt)}`)).toBeTruthy()
  })

  it('renders without a max of zero throwing', () => {
    render(
      <UsageProvider usage={{ used: 0, max: 0, resetAt: null }}>
        <UsageCard />
      </UsageProvider>,
    )
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0')
  })

  it('has no sign-in without signIn', () => {
    render(card(1))
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByText('Sign in for 3 runs a day')).toBeNull()
  })

  it('offers sign-in with signIn', async () => {
    const { container } = render(card(1, { max: 3 }))
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Sign in for 3 runs a day' }))
    expect(dialog.open).toHaveBeenCalledOnce()
    expect(await axe(container)).toHaveNoViolations()
  })
})

describe('resetLabel', () => {
  it('says today, tomorrow or the weekday', () => {
    const now = new Date('2026-10-28T10:00:00')
    expect(resetLabel('2026-10-28T16:17:00', now)).toMatch(/^today at /)
    expect(resetLabel('2026-10-29T09:00:00', now)).toMatch(/^tomorrow at /)
    expect(resetLabel('2026-10-31T09:00:00', now)).toMatch(/^Saturday at /)
  })
})
