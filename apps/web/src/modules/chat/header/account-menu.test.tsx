// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from '@/test/axe'

const nav = vi.hoisted(() => ({ pathname: '/c/a', push: vi.fn(), refresh: vi.fn() }))
const auth = vi.hoisted(() => ({
  session: { data: null, isPending: false } as { data: unknown; isPending: boolean },
  signOut: vi.fn(),
  deleteUser: vi.fn(),
}))
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, refresh: nav.refresh }),
  usePathname: () => nav.pathname,
}))
vi.mock('@/lib/auth-client', () => ({
  authClient: { useSession: () => auth.session, signOut: auth.signOut, deleteUser: auth.deleteUser },
}))
vi.mock('sonner', () => ({ toast: toasts }))

import { AccountMenu, initials } from './account-menu'

const registered = {
  user: { id: 'u', name: 'Ada Lovelace', email: 'ada@example.com', image: null, isAnonymous: false },
}
const anonymous = { user: { id: 'g', name: 'Anonymous', email: 'g@x.y', image: null, isAnonymous: true } }

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

beforeEach(() => {
  nav.pathname = '/c/a'
  nav.push.mockReset()
  nav.refresh.mockReset()
  auth.signOut.mockReset().mockResolvedValue({ data: null, error: null })
  auth.deleteUser.mockReset().mockResolvedValue({ data: {}, error: null })
  toasts.success.mockReset()
  toasts.error.mockReset()
  auth.session = { data: registered, isPending: false }
})

afterEach(cleanup)

const openMenu = () => fireEvent.keyDown(screen.getByRole('button', { name: 'Account menu' }), { key: 'Enter' })

describe('AccountMenu', () => {
  it('renders nothing while pending or without a session', () => {
    auth.session = { data: null, isPending: true }
    const { container } = render(<AccountMenu signInAvailable />)
    expect(container.innerHTML).toBe('')
    cleanup()
    auth.session = { data: null, isPending: false }
    expect(render(<AccountMenu signInAvailable />).container.innerHTML).toBe('')
  })

  it('links anonymous visitors to sign in with the current path', () => {
    auth.session = { data: anonymous, isPending: false }
    render(<AccountMenu signInAvailable />)
    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/sign-in?next=%2Fc%2Fa')
  })

  it('shows nothing to anonymous visitors when no sign-in provider is available', () => {
    auth.session = { data: anonymous, isPending: false }
    const { container } = render(<AccountMenu signInAvailable={false} />)
    expect(container.innerHTML).toBe('')
  })

  it('shows initials on the avatar and name, email and actions in the menu', () => {
    render(<AccountMenu signInAvailable />)
    expect(screen.getByRole('button', { name: 'Account menu' }).textContent).toBe('AL')
    openMenu()
    expect(screen.getByText('Ada Lovelace')).toBeTruthy()
    expect(screen.getByText('ada@example.com')).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Delete account' })).toBeTruthy()
  })

  it('hides the name line when the name is empty', () => {
    auth.session = { data: { user: { ...registered.user, name: '' } }, isPending: false }
    render(<AccountMenu signInAvailable />)
    openMenu()
    const label = screen.getByText('ada@example.com').parentElement
    expect(label?.children).toHaveLength(1)
  })

  it('signs out, goes home and refreshes', async () => {
    render(<AccountMenu signInAvailable />)
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }))
    await waitFor(() => expect(nav.refresh).toHaveBeenCalled())
    expect(auth.signOut).toHaveBeenCalled()
    expect(nav.push).toHaveBeenCalledWith('/')
  })

  it('sends the delete confirmation email', async () => {
    render(<AccountMenu signInAvailable />)
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete account' }))
    const dialog = screen.getByRole('alertdialog')
    expect(within(dialog).getByText('Delete your account?')).toBeTruthy()
    expect(
      within(dialog).getByText(
        "We'll email you a confirmation link. Your conversations and uploads are removed once you confirm.",
      ),
    ).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send confirmation email' }))
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith('Confirmation email sent'))
    expect(auth.deleteUser).toHaveBeenCalledWith({ callbackURL: '/' })
  })

  it('reports a failed confirmation email', async () => {
    auth.deleteUser.mockResolvedValue({ data: null, error: { message: 'nope' } })
    render(<AccountMenu signInAvailable />)
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete account' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send confirmation email' }))
    await waitFor(() => expect(toasts.error).toHaveBeenCalledWith('Could not send the confirmation email'))
    expect(toasts.success).not.toHaveBeenCalled()
  })

  it('has no axe violations', async () => {
    const { container } = render(<AccountMenu signInAvailable />)
    expect(await axe(container)).toHaveNoViolations()
    openMenu()
    expect(await axe(screen.getByRole('menu'))).toHaveNoViolations()
  })
})

describe('initials', () => {
  it.each([
    ['Ada Lovelace', 'x@y.z', 'AL'],
    ['ada', 'x@y.z', 'A'],
    ['', 'x@y.z', 'X'],
    ['Ada Byron Lovelace', 'x@y.z', 'AB'],
  ])('%j with %j gives %j', (name, email, expected) => {
    expect(initials(name, email)).toBe(expected)
  })
})
