// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { SidebarMenu, SidebarProvider } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { axe } from '@/test/axe'

const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }))
const auth = vi.hoisted(() => ({
  session: { data: null, isPending: false } as { data: unknown; isPending: boolean },
  signOut: vi.fn(),
  anonymous: vi.fn(),
  deleteUser: vi.fn(),
}))
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
const dialog = vi.hoisted(() => ({ open: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, refresh: nav.refresh }),
  usePathname: () => '/c/a',
}))
vi.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: () => auth.session,
    signOut: auth.signOut,
    signIn: { anonymous: auth.anonymous },
    deleteUser: auth.deleteUser,
  },
}))
vi.mock('sonner', () => ({ toast: toasts }))
vi.mock('@/modules/auth/sign-in-dialog', () => ({ useSignInDialog: () => dialog }))

import { AccountRow, initials } from './account-row'

const registered = {
  user: { id: 'u', name: 'Ada Lovelace', email: 'ada@example.com', image: null, isAnonymous: false },
}
const anonymous = { user: { id: 'g', name: 'Anonymous', email: 'g@x.y', image: null, isAnonymous: true } }

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})

beforeEach(() => {
  nav.push.mockReset()
  nav.refresh.mockReset()
  auth.signOut.mockReset().mockResolvedValue({ data: null, error: null })
  auth.anonymous.mockReset().mockResolvedValue({ data: {}, error: null })
  auth.deleteUser.mockReset().mockResolvedValue({ data: {}, error: null })
  toasts.success.mockReset()
  toasts.error.mockReset()
  dialog.open.mockReset()
  auth.session = { data: registered, isPending: false }
})

afterEach(cleanup)

const renderRow = (signInAvailable = true, open = true) =>
  render(
    <TooltipProvider>
      <SidebarProvider defaultOpen={open}>
        <SidebarMenu>
          <AccountRow signInAvailable={signInAvailable} />
        </SidebarMenu>
      </SidebarProvider>
    </TooltipProvider>,
  )

const trigger = () => screen.getByRole('button', { name: /ada@example\.com/ })
const openMenu = () => fireEvent.keyDown(trigger(), { key: 'Enter' })
const menu = () => screen.getByRole('menu')

describe('AccountRow', () => {
  it('renders nothing while pending or without a session', () => {
    auth.session = { data: null, isPending: true }
    const { container } = renderRow()
    expect(container.querySelector('li')).toBeNull()
    cleanup()
    auth.session = { data: null, isPending: false }
    expect(renderRow().container.querySelector('li')).toBeNull()
  })

  it('renders nothing for guests in the expanded sidebar', () => {
    auth.session = { data: anonymous, isPending: false }
    const { container } = renderRow(true, true)
    expect(container.querySelector('li')).toBeNull()
  })

  it('gives guests a Sign in icon button in the rail that opens the dialog', async () => {
    auth.session = { data: anonymous, isPending: false }
    const { container } = renderRow(true, false)
    const button = screen.getByRole('button', { name: 'Sign in' })
    expect(button.querySelector('svg')).toBeTruthy()
    fireEvent.click(button)
    expect(dialog.open).toHaveBeenCalledOnce()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('shows guests nothing in the rail without a sign-in provider', () => {
    auth.session = { data: anonymous, isPending: false }
    const { container } = renderRow(false, false)
    expect(container.querySelector('li')).toBeNull()
  })

  it('shows avatar initials, name and email, and a menu with Sign out and Delete account', () => {
    renderRow()
    expect(trigger().textContent).toBe('ALAda Lovelaceada@example.com')
    openMenu()
    expect(within(menu()).getByText('Ada Lovelace')).toBeTruthy()
    expect(within(menu()).getByText('ada@example.com')).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Delete account' })).toBeTruthy()
  })

  it('keeps the avatar as the rail button for signed-in users', () => {
    renderRow(true, false)
    expect(trigger().querySelector('[data-slot="avatar"]')).toBeTruthy()
  })

  it('hides the name line when the name is empty', () => {
    auth.session = { data: { user: { ...registered.user, name: '' } }, isPending: false }
    renderRow()
    expect(trigger().textContent).toBe('Aada@example.com')
    openMenu()
    const label = within(menu()).getByText('ada@example.com').parentElement
    expect(label?.children).toHaveLength(1)
  })

  it('signs out, creates the guest session, then goes home and refreshes', async () => {
    renderRow()
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }))
    await waitFor(() => expect(nav.refresh).toHaveBeenCalled())
    expect(nav.push).toHaveBeenCalledWith('/')
    const order = [auth.signOut, auth.anonymous, nav.push, nav.refresh].map((fn) => fn.mock.invocationCallOrder[0])
    expect(order).toEqual([...order].sort((a, b) => (a ?? 0) - (b ?? 0)))
    expect(order.every((n) => n !== undefined)).toBe(true)
  })

  it('still navigates when the guest sign-in fails', async () => {
    auth.anonymous.mockRejectedValue(new Error('offline'))
    renderRow()
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }))
    await waitFor(() => expect(nav.refresh).toHaveBeenCalled())
    expect(nav.push).toHaveBeenCalledWith('/')
  })

  it('sends the delete confirmation email', async () => {
    renderRow()
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete account' }))
    const alert = screen.getByRole('alertdialog')
    expect(within(alert).getByText('Delete your account?')).toBeTruthy()
    expect(
      within(alert).getByText(
        "We'll email you a confirmation link. Your conversations and uploads are removed once you confirm.",
      ),
    ).toBeTruthy()
    fireEvent.click(within(alert).getByRole('button', { name: 'Send confirmation email' }))
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith('Confirmation email sent'))
    expect(auth.deleteUser).toHaveBeenCalledWith({ callbackURL: '/' })
  })

  it('reports a failed confirmation email', async () => {
    auth.deleteUser.mockResolvedValue({ data: null, error: { message: 'nope' } })
    renderRow()
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete account' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send confirmation email' }))
    await waitFor(() => expect(toasts.error).toHaveBeenCalledWith('Could not send the confirmation email'))
    expect(toasts.success).not.toHaveBeenCalled()
  })

  it('has no axe violations', async () => {
    const { container } = renderRow()
    expect(await axe(container)).toHaveNoViolations()
    openMenu()
    expect(await axe(menu())).toHaveNoViolations()
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
