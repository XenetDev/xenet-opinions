// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthProviders } from '@/lib/auth-providers'
import { axe } from '@/test/axe'

const client = vi.hoisted(() => ({ social: vi.fn() }))
const nav = vi.hoisted(() => {
  const replace = vi.fn()
  return { search: '', replace, router: { replace } }
})
const toasts = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))

vi.mock('next/navigation', () => ({
  usePathname: () => '/c/abc',
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => nav.router,
}))
vi.mock('sonner', () => ({ toast: toasts }))
vi.mock('@/lib/auth-client', () => ({ authClient: { signIn: { magicLink: vi.fn(), social: client.social } } }))

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

beforeEach(() => {
  nav.search = ''
  nav.replace.mockReset()
  toasts.error.mockReset()
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
    const overlay = document.querySelector('[data-slot="dialog-overlay"]')?.className ?? ''
    expect(overlay).toContain('supports-backdrop-filter:backdrop-blur-sm')
    expect(overlay).not.toContain('backdrop-blur-xs')
    expect(await axe(document.body)).toHaveNoViolations()
  })

  it('hands the current path to the card as next', async () => {
    client.social.mockReset().mockResolvedValue({ data: null, error: null })
    renderProvider()
    act(() => open())
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Google' }))
    await waitFor(() => expect(client.social).toHaveBeenCalledWith({ provider: 'google', callbackURL: '/c/abc' }))
  })

  it('opens from ?signIn=1 and strips the sign-in params, keeping the rest', () => {
    nav.search = 'signIn=1&tab=report'
    renderProvider()
    expect(screen.getByRole('dialog', { name: 'Sign in' })).toBeTruthy()
    expect(nav.replace).toHaveBeenCalledWith('/c/abc?tab=report')
    expect(toasts.error).not.toHaveBeenCalled()
  })

  it('toasts the expired link from ?signInError=expired and replaces with the bare path', () => {
    nav.search = 'signIn=1&signInError=expired'
    renderProvider()
    expect(screen.getByRole('dialog', { name: 'Sign in' })).toBeTruthy()
    expect(toasts.error).toHaveBeenCalledWith('That link has expired or was already used. Request a new one.', {
      id: 'sign-in-expired',
    })
    expect(nav.replace).toHaveBeenCalledWith('/c/abc')
  })

  it('ignores other params and does not replace', () => {
    nav.search = 'tab=report'
    renderProvider()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(nav.replace).not.toHaveBeenCalled()
  })

  it('does not carry the expired notice into a later open()', async () => {
    nav.search = 'signIn=1&signInError=expired'
    renderProvider()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    toasts.error.mockReset()
    act(() => open())
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(toasts.error).not.toHaveBeenCalled()
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
