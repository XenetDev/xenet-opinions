// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const nav = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, refresh: vi.fn() }),
  usePathname: () => '/',
}))
vi.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: () => ({
      data: { user: { id: 'u', name: 'Ada', email: 'ada@example.com', image: null, isAnonymous: false } },
      isPending: false,
    }),
  },
}))
vi.mock('@/modules/auth/sign-in-dialog', () => ({ useSignInDialog: () => ({ open: vi.fn() }) }))
vi.mock('@/modules/guide/guide-provider', () => ({ useGuide: () => ({ open: vi.fn() }) }))
vi.mock('../header/chat-header', () => ({
  ChatHeader: ({ onSearch }: { onSearch: () => void }) => (
    <button type="button" onClick={onSearch}>
      Header search
    </button>
  ),
}))

import { TooltipProvider } from '@/components/ui/tooltip'
import { ChatActivityProvider } from '../chat-activity'
import { ChatListProvider } from '../chat-list-context'
import { Shell } from './shell'
import { UsageProvider } from './usage-context'

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

beforeEach(() => nav.push.mockReset())
afterEach(cleanup)

const renderShell = () =>
  render(
    <TooltipProvider>
      <ChatListProvider
        chats={[{ id: 'a', title: 'Price increase', runStatus: 'done', updatedAt: new Date().toISOString() }]}
      >
        <ChatActivityProvider>
          <UsageProvider usage={{ used: 1, max: 3, resetAt: null }}>
            <Shell signInAvailable defaultOpen hadCookie>
              <textarea aria-label="Composer" />
            </Shell>
          </UsageProvider>
        </ChatActivityProvider>
      </ChatListProvider>
    </TooltipProvider>,
  )

const searchButton = () => screen.getByRole('button', { name: 'Search chats' })

describe('Shell search', () => {
  it('opens the palette from the Search row, header button and Cmd+K', () => {
    renderShell()
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(searchButton())
    expect(screen.getByRole('dialog', { name: 'Search chats' })).toBeTruthy()
    fireEvent.keyDown(screen.getByPlaceholderText('Search chats…'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Header search' }))
    expect(screen.getByRole('dialog', { name: 'Search chats' })).toBeTruthy()
    fireEvent.keyDown(screen.getByPlaceholderText('Search chats…'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(screen.getByRole('dialog', { name: 'Search chats' })).toBeTruthy()
  })

  it('returns focus to the Search button on Escape', async () => {
    renderShell()
    searchButton().focus()
    fireEvent.click(searchButton())
    fireEvent.keyDown(screen.getByPlaceholderText('Search chats…'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(searchButton()))
  })

  it('keeps composer text typed before opening', async () => {
    renderShell()
    const composer = screen.getByRole('textbox', { name: 'Composer' }) as HTMLTextAreaElement
    fireEvent.change(composer, { target: { value: 'draft text' } })
    composer.focus()
    fireEvent.keyDown(composer, { key: 'k', metaKey: true })
    expect(screen.getByRole('dialog', { name: 'Search chats' })).toBeTruthy()
    fireEvent.keyDown(screen.getByPlaceholderText('Search chats…'), { key: 'Escape' })
    expect(composer.value).toBe('draft text')
    await waitFor(() => expect(document.activeElement).toBe(composer))
  })

  it('returns focus to the composer after Cmd+K is pressed twice', async () => {
    renderShell()
    const composer = screen.getByRole('textbox', { name: 'Composer' })
    composer.focus()
    fireEvent.keyDown(composer, { key: 'k', metaKey: true })
    fireEvent.keyDown(screen.getByPlaceholderText('Search chats…'), { key: 'k', metaKey: true })
    fireEvent.keyDown(screen.getByPlaceholderText('Search chats…'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(composer))
  })

  it('starts a new chat on Cmd+Shift+O', () => {
    renderShell()
    fireEvent.keyDown(window, { key: 'O', metaKey: true, shiftKey: true })
    expect(nav.push).toHaveBeenCalledWith('/')
  })
})
