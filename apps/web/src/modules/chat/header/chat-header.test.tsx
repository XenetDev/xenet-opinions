// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { SidebarProvider } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { axe } from '@/test/axe'

const nav = vi.hoisted(() => ({ pathname: '/c/a', push: vi.fn(), refresh: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, refresh: nav.refresh }),
  usePathname: () => nav.pathname,
}))

import { type ChatActivity, ChatActivityProvider, useChatActivity } from '../chat-activity'
import { type ChatListItem, ChatListProvider, type ChatUpsert, useChatList } from '../chat-list-context'
import { History } from '../shell/history'
import { ChatHeader } from './chat-header'

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

beforeEach(() => {
  nav.pathname = '/c/a'
  nav.push.mockReset()
  nav.refresh.mockReset()
  onSearch.mockReset()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const today = new Date().toISOString()
const earlier = new Date(Date.now() - 3 * 86_400_000).toISOString()

const CHATS: ChatListItem[] = [
  { id: 'a', title: 'Price increase', runStatus: 'running', updatedAt: today },
  { id: 'b', title: 'Scooter ban', runStatus: 'done', updatedAt: today },
  { id: 'c', title: 'Office return', runStatus: 'none', updatedAt: earlier },
]

let grabbed: { upsert: (chat: ChatUpsert) => void; setActivity: (activity: ChatActivity | null) => void } = {
  upsert: () => {},
  setActivity: () => {},
}
const Grab = () => {
  grabbed = { upsert: useChatList().upsertChat, setActivity: useChatActivity().setActivity }
  return null
}

const Sidebar = () => <History chats={useChatList().chats} activeId="a" activeRunning={false} />

const onSearch = vi.fn()

const renderHeader = (chats: ChatListItem[] = CHATS, activity?: ChatActivity) => {
  const result = render(
    <TooltipProvider>
      <SidebarProvider>
        <ChatListProvider chats={chats}>
          <ChatActivityProvider>
            <ChatHeader onSearch={onSearch} />
            <Sidebar />
            <Grab />
          </ChatActivityProvider>
        </ChatListProvider>
      </SidebarProvider>
    </TooltipProvider>,
  )
  if (activity) act(() => grabbed.setActivity(activity))
  return result
}

const title = () => screen.getByRole('heading', { level: 1 })
const sidebar = () => screen.getByTestId('history')
const openOptions = () => fireEvent.keyDown(screen.getByRole('button', { name: 'Chat options' }), { key: 'Enter' })

describe('ChatHeader', () => {
  it('names the open chat and reads "New chat" on the home page', () => {
    renderHeader()
    expect(title().textContent).toBe('Price increase')
    expect(title().className).toContain('truncate')
    cleanup()
    nav.pathname = '/'
    renderHeader()
    expect(title().textContent).toBe('New chat')
  })

  it('opens the sidebar from a mobile-only trigger at the start of the header', () => {
    renderHeader()
    const trigger = screen.getByRole('button', { name: 'Open sidebar' })
    expect(screen.getByRole('banner').firstElementChild).toBe(trigger)
    expect(trigger.className).toContain('md:hidden')
  })

  it('searches chats from a mobile-only button', () => {
    renderHeader()
    const search = screen.getByRole('button', { name: 'Search chats' })
    expect(search.className).toContain('md:hidden')
    fireEvent.click(search)
    expect(onSearch).toHaveBeenCalledTimes(1)
  })

  it('keeps only the trigger, title, badge, search and options in the header', () => {
    renderHeader()
    const banner = within(screen.getByRole('banner'))
    for (const name of ['New chat', 'Sign in', 'Account menu', 'How it works', /theme/i, /Switch chat/])
      expect(banner.queryByRole('button', { name })).toBeNull()
  })

  it('falls back to "New conversation" for an untitled chat', () => {
    renderHeader([{ id: 'a', title: '', runStatus: 'none', updatedAt: today }])
    expect(title().textContent).toBe('New conversation')
  })

  it('shows the Working badge while the open chat runs', () => {
    renderHeader()
    expect(within(screen.getByRole('banner')).getByText('Working')).toBeTruthy()
    act(() => grabbed.upsert({ id: 'a', runStatus: 'done' }))
    expect(within(screen.getByRole('banner')).queryByText('Working')).toBeNull()
    act(() => grabbed.setActivity({ chatId: 'a', running: true }))
    const badge = within(screen.getByRole('banner')).getByText('Working')
    expect(badge.className).not.toContain('max-md:hidden')
  })

  it('hides the options menu on the home page', () => {
    nav.pathname = '/'
    renderHeader()
    expect(screen.queryByRole('button', { name: 'Chat options' })).toBeNull()
  })

  it('renames the open chat from the options menu', async () => {
    const fetchStub = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }))
    renderHeader()
    expect(within(sidebar()).getByRole('link', { name: /Price increase/ })).toBeTruthy()
    openOptions()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    const input = screen.getByRole('textbox', { name: 'Title' }) as HTMLInputElement
    expect(input.value).toBe('Price increase')
    fireEvent.change(input, { target: { value: 'Pro plan pricing' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(title().textContent).toBe('Pro plan pricing'))
    expect(
      within(sidebar())
        .getByRole('link', { name: /Pro plan pricing/ })
        .getAttribute('href'),
    ).toBe('/c/a')
    expect(within(sidebar()).queryByRole('link', { name: /Price increase/ })).toBeNull()
    expect(fetchStub).toHaveBeenCalledWith('/api/chats/a', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Pro plan pricing' }),
    })
    expect(nav.refresh).toHaveBeenCalled()
  })

  it('keeps the dialog open with an error when the rename fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 500 }))
    renderHeader()
    openOptions()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: 'Other' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Title' })).toBeTruthy()
    expect(screen.getByRole('banner', { hidden: true }).textContent).toContain('Price increase')
  })

  it('deletes the open chat after confirmation and goes home', async () => {
    const fetchStub = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }))
    renderHeader()
    openOptions()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    const confirm = screen.getByRole('alertdialog')
    expect(within(confirm).getByText('Delete this conversation?')).toBeTruthy()
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/'))
    expect(fetchStub).toHaveBeenCalledWith('/api/chats/a', { method: 'DELETE' })
    expect(nav.refresh).toHaveBeenCalled()
    expect(within(sidebar()).queryByRole('link', { name: /Price increase/ })).toBeNull()
    expect(within(sidebar()).getByRole('link', { name: 'Scooter ban' })).toBeTruthy()
  })

  it('stays put when the delete fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 500 }))
    renderHeader()
    openOptions()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    expect(nav.push).not.toHaveBeenCalled()
  })

  it('has no axe violations while running and on the home page', async () => {
    const { container } = renderHeader(CHATS, { chatId: 'a', running: true, step: 'Writing the report' })
    expect(await axe(container)).toHaveNoViolations()
    cleanup()
    nav.pathname = '/'
    const home = renderHeader()
    expect(await axe(home.container)).toHaveNoViolations()
  })
})
