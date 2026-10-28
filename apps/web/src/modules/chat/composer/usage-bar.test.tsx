// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { axe } from '@/test/axe'
import { UsageBar } from './usage-bar'

const usage = { used: 1, max: 1, resetAt: '2026-10-29T08:00:00.000Z' }

afterEach(cleanup)

describe('UsageBar', () => {
  it('has no sign-in link without signIn', () => {
    render(<UsageBar usage={usage} />)
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('links to sign-in when signIn is given', async () => {
    const { container } = render(<UsageBar usage={usage} signIn={{ max: 3, href: '/sign-in?next=%2F' }} />)
    const link = screen.getByRole('link', { name: 'Sign in for 3 runs a day' })
    expect(link.getAttribute('href')).toBe('/sign-in?next=%2F')
    expect(await axe(container)).toHaveNoViolations()
  })
})
