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
})
