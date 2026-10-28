// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { AuthProviders } from '@/lib/auth-providers'
import { axe } from '@/test/axe'

vi.mock('next/navigation', () => ({ usePathname: () => '/c/abc' }))
vi.mock('@/lib/auth-client', () => ({ authClient: { signIn: { magicLink: vi.fn(), social: vi.fn() } } }))

import { SignInDialogProvider, useSignInDialog } from './sign-in-dialog'

const PROVIDERS: AuthProviders = { magicLink: true, google: true, github: true, apple: false }

let open: () => void = () => {}
const Grab = () => {
  open = useSignInDialog().open
  return null
}

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

afterEach(() => {
  cleanup()
  open = () => {}
})

const renderProvider = () =>
  render(
    <SignInDialogProvider providers={PROVIDERS}>
      <Grab />
    </SignInDialogProvider>,
  )

describe('SignInDialogProvider', () => {
  it('renders nothing until open() is called', () => {
    const { container } = renderProvider()
    expect(container.innerHTML).toBe('')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens the sign-in card in an accessible dialog', async () => {
    renderProvider()
    act(() => open())
    const dialog = screen.getByRole('dialog', { name: 'Sign in' })
    expect(within(dialog).getByRole('textbox', { name: 'Email' })).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'Google' })).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'GitHub' })).toBeTruthy()
    expect(document.querySelector('[data-slot="dialog-overlay"]')?.className).toContain('backdrop-blur-sm')
    expect(await axe(document.body)).toHaveNoViolations()
  })

  it('closes on Escape', async () => {
    renderProvider()
    act(() => open())
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('is a no-op outside a provider', () => {
    render(<Grab />)
    expect(() => open()).not.toThrow()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
