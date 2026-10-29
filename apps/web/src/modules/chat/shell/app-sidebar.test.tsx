// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { SidebarProvider, useSidebar } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { axe } from '@/test/axe'

const mobile = vi.hoisted(() => ({ value: false }))
const nav = vi.hoisted(() => ({ pathname: '/c/a', push: vi.fn(), refresh: vi.fn() }))
const session = vi.hoisted(() => ({ isAnonymous: false }))
const guide = vi.hoisted(() => ({ open: vi.fn() }))

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => mobile.value }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, refresh: nav.refresh }),
  usePathname: () => nav.pathname,
}))
vi.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: () => ({
      data: {
        user: {
          id: 'u',
          name: 'Ada Lovelace',
          email: 'ada@example.com',
          image: null,
          isAnonymous: session.isAnonymous,
        },
      },
      isPending: false,
    }),
  },
}))
vi.mock('@/modules/auth/sign-in-dialog', () => ({ useSignInDialog: () => ({ open: vi.fn() }) }))
vi.mock('@/modules/guide/guide-provider', () => ({ useGuide: () => guide }))

import { ChatActivityProvider } from '../chat-activity'
import { type ChatListItem, ChatListProvider } from '../chat-list-context'
import { AppSidebar } from './app-sidebar'
import { UsageProvider } from './usage-context'

const CHATS: ChatListItem[] = [
  { id: 'a', title: 'Price increase', runStatus: 'done', updatedAt: new Date().toISOString() },
]

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
  nav.pathname = '/c/a'
  nav.push.mockReset()
  session.isAnonymous = false
  mobile.value = false
})

afterEach(cleanup)

const onSearch = vi.fn()

const renderSidebar = ({ open = true, chats = CHATS }: { open?: boolean; chats?: ChatListItem[] } = {}) =>
  render(
    <TooltipProvider>
      <SidebarProvider defaultOpen={open}>
        <ChatListProvider chats={chats}>
          <ChatActivityProvider>
            <UsageProvider usage={{ used: 1, max: 3, resetAt: null }}>
              <AppSidebar onSearch={onSearch} />
            </UsageProvider>
          </ChatActivityProvider>
        </ChatListProvider>
      </SidebarProvider>
    </TooltipProvider>,
  )

const SheetState = () => {
  const { openMobile, setOpenMobile } = useSidebar()
  return (
    <>
      <span data-testid="sheet">{String(openMobile)}</span>
      <button type="button" data-testid="open-sheet" onClick={() => setOpenMobile(true)} />
    </>
  )
}

const renderMobile = () => {
  mobile.value = true
  onSearch.mockReset()
  return render(
    <TooltipProvider>
      <SidebarProvider>
        <ChatListProvider chats={CHATS}>
          <ChatActivityProvider>
            <UsageProvider usage={{ used: 1, max: 3, resetAt: null }}>
              <SheetState />
              <AppSidebar onSearch={onSearch} />
            </UsageProvider>
          </ChatActivityProvider>
        </ChatListProvider>
      </SidebarProvider>
    </TooltipProvider>,
  )
}

const precedes = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0

describe('AppSidebar', () => {
  it('links the brand home and keeps the collapse toggle', () => {
    renderSidebar()
    const brand = screen.getByRole('link', { name: 'Xenet Opinions' })
    expect(brand.getAttribute('href')).toBe('/')
    expect(brand.querySelector('svg')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Toggle Sidebar' })).toBeTruthy()
  })

  it('starts a new chat at home', () => {
    renderSidebar()
    const button = screen.getByRole('button', { name: 'New chat' })
    expect(button.textContent).toContain('⌘⇧O')
    fireEvent.click(button)
    expect(nav.push).toHaveBeenCalledWith('/')
  })

  it('opens search', () => {
    onSearch.mockReset()
    renderSidebar()
    const button = screen.getByRole('button', { name: 'Search chats' })
    expect(button.textContent).toContain('⌘K')
    fireEvent.click(button)
    expect(onSearch).toHaveBeenCalledOnce()
  })

  it('shows the history with the open chat marked', () => {
    renderSidebar()
    expect(screen.getByTestId('history')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Price increase' }).getAttribute('aria-current')).toBe('page')
  })

  it('tells guests with no chats that history stays on this device', () => {
    session.isAnonymous = true
    renderSidebar({ chats: [] })
    expect(screen.getByText('Chats on this device only. Sign in to keep them.')).toBeTruthy()
  })

  it('orders the footer usage card, Theme, How it works', () => {
    renderSidebar()
    const card = screen.getByText('Runs today')
    const theme = screen.getByRole('button', { name: /Theme/ })
    const help = screen.getByRole('button', { name: 'How it works' })
    expect(precedes(card, theme)).toBe(true)
    expect(precedes(theme, help)).toBe(true)
    fireEvent.click(help)
    expect(guide.open).toHaveBeenCalledOnce()
  })

  it('collapses to a rail without history or the usage card', async () => {
    const { container } = renderSidebar({ open: false })
    expect(screen.queryByTestId('history')).toBeNull()
    expect(screen.queryByText('Runs today')).toBeNull()
    expect(screen.getByRole('link', { name: 'Xenet Opinions' }).querySelector('svg')).toBeTruthy()
    expect(screen.getByText('Xenet Opinions').className).toContain('sr-only')
    for (const name of ['New chat', 'Search chats']) {
      const button = screen.getByRole('button', { name })
      expect(button.getAttribute('data-slot')).toBe('sidebar-menu-button')
      expect(button.getAttribute('data-state')).toBe('closed')
      expect(button.textContent).not.toMatch(/⌘/)
    }
    expect(await axe(container)).toHaveNoViolations()
  })

  it('shows the rail tooltip on focus', async () => {
    renderSidebar({ open: false })
    fireEvent.focus(screen.getByRole('button', { name: 'New chat' }))
    expect((await screen.findByRole('tooltip')).textContent).toBe('New chat')
  })

  it('has no axe violations', async () => {
    const { container } = renderSidebar()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('lists both modifiers in aria-keyshortcuts', () => {
    renderSidebar()
    expect(screen.getByRole('button', { name: 'New chat' }).getAttribute('aria-keyshortcuts')).toBe(
      'Meta+Shift+O Control+Shift+O',
    )
    expect(screen.getByRole('button', { name: 'Search chats' }).getAttribute('aria-keyshortcuts')).toBe(
      'Meta+K Control+K',
    )
  })

  it('puts motion-reduce on the sidebar container and gap', () => {
    const { container } = renderSidebar()
    const parts = container.querySelectorAll('[data-slot="sidebar-gap"], [data-slot="sidebar-container"]')
    expect(parts).toHaveLength(2)
    for (const part of parts) expect(part.className).toContain('motion-reduce:transition-none')
  })

  describe('on mobile', () => {
    it.each([
      ['Search chats', () => expect(onSearch).toHaveBeenCalledOnce()],
      ['New chat', () => expect(nav.push).toHaveBeenCalledWith('/')],
    ])('closes the sheet when %s is pressed', (name, assert) => {
      renderMobile()
      fireEvent.click(screen.getByTestId('open-sheet'))
      expect(screen.getByTestId('sheet').textContent).toBe('true')
      fireEvent.click(screen.getByRole('button', { name }))
      expect(screen.getByTestId('sheet').textContent).toBe('false')
      assert()
    })

    it('closes the sheet when the brand link is tapped', () => {
      renderMobile()
      fireEvent.click(screen.getByTestId('open-sheet'))
      expect(screen.getByTestId('sheet').textContent).toBe('true')
      fireEvent.click(document.querySelector('a[href="/"]') as HTMLElement)
      expect(screen.getByTestId('sheet').textContent).toBe('false')
    })
  })
})
