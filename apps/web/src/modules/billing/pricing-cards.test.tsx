// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/modules/auth/sign-in-dialog', () => ({ useSignInDialog: () => ({ open: vi.fn() }) }))
vi.mock('./billing-actions', () => ({ openBillingPortal: vi.fn(), startCheckout: vi.fn() }))

import { PricingCards } from './pricing-cards'

afterEach(cleanup)

describe('PricingCards', () => {
  it('shows runs and participants per plan', () => {
    render(<PricingCards plan="free" subscribed={false} />)
    expect(screen.getAllByText('2 runs a month')).toHaveLength(2)
    expect(screen.getByText('1 run a month')).toBeTruthy()
    expect(screen.getByText('Up to 10 participants')).toBeTruthy()
    expect(screen.getByText('Up to 25 participants')).toBeTruthy()
    expect(screen.getByText('Up to 50 participants')).toBeTruthy()
  })

  it('offers Enterprise for thousands of participants with an email to Greg', () => {
    render(<PricingCards plan="pro" subscribed />)
    const card = screen.getByRole('region', { name: 'Enterprise' })
    expect(card.textContent).toContain('thousands of participants per simulation')
    const link = screen.getByRole('link', { name: 'Contact us' })
    const href = link.getAttribute('href') ?? ''
    expect(href.startsWith('mailto:greg@xenet.ai?')).toBe(true)
    const params = new URLSearchParams(href.slice(href.indexOf('?') + 1))
    expect(params.get('subject')).toBe('Xenet Opinions Enterprise enquiry')
    expect(params.get('body')).toContain('Participants per simulation:')
    expect(href).not.toContain('+')
  })
})
