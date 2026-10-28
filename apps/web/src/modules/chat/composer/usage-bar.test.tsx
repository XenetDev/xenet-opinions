// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { axe } from '@/test/axe'

const dialog = vi.hoisted(() => ({ open: vi.fn() }))

vi.mock('@/modules/auth/sign-in-dialog', () => ({ useSignInDialog: () => dialog }))

import { UsageBar } from './usage-bar'

const usage = { used: 1, max: 1, resetAt: '2026-10-29T08:00:00.000Z' }

afterEach(() => {
  cleanup()
  dialog.open.mockReset()
})

describe('UsageBar', () => {
  it('has no sign-in button without signIn', () => {
    render(<UsageBar usage={usage} />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('opens the sign-in dialog when signIn is given', async () => {
    const { container } = render(<UsageBar usage={usage} signIn={{ max: 3 }} />)
    const button = screen.getByRole('button', { name: 'Sign in for 3 runs a day' })
    expect(button.getAttribute('type')).toBe('button')
    expect(screen.queryByRole('link')).toBeNull()
    fireEvent.click(button)
    expect(dialog.open).toHaveBeenCalledOnce()
    expect(await axe(container)).toHaveNoViolations()
  })
})
