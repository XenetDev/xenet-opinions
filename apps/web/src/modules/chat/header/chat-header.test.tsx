// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { axe } from '@/test/axe'

const nav = vi.hoisted(() => ({ pathname: '/c/a', push: vi.fn(), refresh: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, refresh: nav.refresh }),
  usePathname: () => nav.pathname,
}))

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: () => ({
      data: { user: { id: 'g', name: 'Guest', email: 'g@x.y', isAnonymous: true } },
      isPending: false,
    }),
  },
}))

import { type ChatActivity, ChatActivityProvider, useChatActivity } from '../chat-activity'
import { type ChatListItem, ChatListProvider, type ChatUpsert, useChatList } from '../chat-list-context'
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

const renderHeader = (chats: ChatListItem[] = CHATS, activity?: ChatActivity, signInAvailable = true) => {
  const result = render(
    <TooltipProvider>
      <ChatListProvider chats={chats}>
        <ChatActivityProvider>
          <ChatHeader signInAvailable={signInAvailable} />
          <Grab />
        </ChatActivityProvider>
      </ChatListProvider>
    </TooltipProvider>,
  )
  if (activity) act(() => grabbed.setActivity(activity))
  return result
}

const openSwitcher = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }))
const switcher = () => screen.getByRole('dialog')
const openOptions = () => fireEvent.keyDown(screen.getByRole('button', { name: 'Chat options' }), { key: 'Enter' })

describe('ChatHeader', () => {
  it('names the open chat and reads "New chat" on the home page', () => {
    renderHeader()
    expect(screen.getByRole('button', { name: 'Switch chat, Price increase' })).toBeTruthy()
    cleanup()
    nav.pathname = '/'
    renderHeader()
    expect(screen.getByRole('button', { name: 'Switch chat, New chat' })).toBeTruthy()
    expect(screen.getByRole('banner').textContent).toContain('New chat')
  })

  it('offers sign in to anonymous visitors', () => {
    renderHeader()
    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/sign-in?next=%2Fc%2Fa')
  })

  it('hides sign in when no provider is available', () => {
    renderHeader(CHATS, undefined, false)
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull()
  })

  it('falls back to "New conversation" for an untitled chat', () => {
    renderHeader([{ id: 'a', title: '', runStatus: 'none', updatedAt: today }])
    expect(screen.getByRole('button', { name: 'Switch chat, New conversation' })).toBeTruthy()
  })

  it('groups chats under Today and Earlier in All, and filters the Today and Earlier tabs', () => {
    renderHeader()
    openSwitcher(/Price increase/)
    const groups = within(switcher()).getAllByRole('region')
    expect(groups.map((group) => group.getAttribute('aria-label'))).toEqual(['Today', 'Earlier'])
    expect(
      within(groups[0] as HTMLElement)
        .getAllByRole('link')
        .map((b) => b.textContent),
    ).toEqual([expect.stringContaining('Price increase'), expect.stringContaining('Scooter ban')])
    expect(within(groups[1] as HTMLElement).getByRole('link').textContent).toContain('Office return')

    fireEvent.mouseDown(within(switcher()).getByRole('tab', { name: 'Earlier' }))
    const panel = within(switcher()).getByRole('tabpanel')
    expect(
      within(panel)
        .getAllByRole('link')
        .map((b) => b.textContent),
    ).toEqual([expect.stringContaining('Office return')])
    fireEvent.mouseDown(within(switcher()).getByRole('tab', { name: 'Today' }))
    expect(within(within(switcher()).getByRole('tabpanel')).getAllByRole('link')).toHaveLength(2)
  })

  it('marks the active chat with aria-current and shows relative times', () => {
    renderHeader()
    openSwitcher(/Price increase/)
    const active = within(switcher()).getByRole('link', { current: 'page' })
    expect(active.getAttribute('href')).toBe('/c/a')
    expect(active.textContent).toContain('Price increase')
    expect(active.textContent).toContain('just now')
    expect(within(switcher()).getAllByRole('link', { current: 'page' })).toHaveLength(1)
  })

  it('shows a spinner and the live step on the running chat row', () => {
    renderHeader(CHATS, { chatId: 'a', running: true, step: 'Writing the report' })
    openSwitcher(/Price increase/)
    const row = within(switcher()).getByRole('link', { current: 'page' })
    expect(row.querySelector('[data-slot="spinner"]')).toBeTruthy()
    const label = within(row).getByText('Writing the report')
    expect(label.className).toContain('shimmer')
    expect(within(switcher()).getAllByText('Writing the report')).toHaveLength(1)
  })

  it('shows a running row for other active chats and drops it when the run ends', () => {
    renderHeader()
    openSwitcher(/Price increase/)
    expect(within(switcher()).getAllByText('Working')).toHaveLength(1)
    act(() => grabbed.upsert({ id: 'b', runStatus: 'queued' }))
    expect(within(switcher()).getAllByText('Working')).toHaveLength(2)
    act(() => grabbed.upsert({ id: 'a', runStatus: 'done' }))
    act(() => grabbed.upsert({ id: 'b', runStatus: 'done' }))
    expect(within(switcher()).queryByText('Working')).toBeNull()
    expect(switcher().querySelector('[data-slot="spinner"]')).toBeNull()
  })

  it('shows the Working badge while the open chat runs', () => {
    renderHeader()
    expect(within(screen.getByRole('banner')).getByText('Working')).toBeTruthy()
    act(() => grabbed.upsert({ id: 'a', runStatus: 'done' }))
    expect(within(screen.getByRole('banner')).queryByText('Working')).toBeNull()
    act(() => grabbed.setActivity({ chatId: 'a', running: true }))
    expect(within(screen.getByRole('banner')).getByText('Working')).toBeTruthy()
  })

  it('links each row to its chat and closes the switcher on select', () => {
    renderHeader()
    openSwitcher(/Price increase/)
    const row = within(switcher()).getByRole('link', { name: /Office return/ })
    expect(row.getAttribute('href')).toBe('/c/c')
    fireEvent.click(row)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('moves focus into the switcher on open, onto the active row, and arrows across the tabs', async () => {
    renderHeader()
    const trigger = screen.getByRole('button', { name: 'Switch chat, Price increase' })
    trigger.focus()
    fireEvent.click(trigger)
    expect(switcher().contains(document.activeElement)).toBe(true)
    expect(document.activeElement).toBe(within(switcher()).getByRole('link', { current: 'page' }))
    const all = within(switcher()).getByRole('tab', { name: 'All' })
    all.focus()
    fireEvent.keyDown(all, { key: 'ArrowRight' })
    await waitFor(() => expect(document.activeElement).toBe(within(switcher()).getByRole('tab', { name: 'Today' })))
  })

  it('lands on the first tab when the open chat is not listed', () => {
    nav.pathname = '/'
    renderHeader()
    fireEvent.click(screen.getByRole('button', { name: 'Switch chat, New chat' }))
    expect(document.activeElement).toBe(within(switcher()).getByRole('tab', { name: 'All' }))
  })

  it('goes home from the "+" in the tab strip and the header without creating a chat', () => {
    const fetchStub = vi.spyOn(globalThis, 'fetch')
    renderHeader()
    openSwitcher(/Price increase/)
    fireEvent.click(within(switcher()).getByRole('button', { name: 'New chat' }))
    expect(nav.push).toHaveBeenCalledWith('/')
    expect(screen.queryByRole('dialog')).toBeNull()
    nav.push.mockReset()
    fireEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: 'New chat' }))
    expect(nav.push).toHaveBeenCalledWith('/')
    expect(fetchStub).not.toHaveBeenCalled()
  })

  it('hides the options menu on the home page', () => {
    nav.pathname = '/'
    renderHeader()
    expect(screen.queryByRole('button', { name: 'Chat options' })).toBeNull()
  })

  it('renames the open chat from the options menu', async () => {
    const fetchStub = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }))
    renderHeader()
    openOptions()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    const input = screen.getByRole('textbox', { name: 'Title' }) as HTMLInputElement
    expect(input.value).toBe('Price increase')
    fireEvent.change(input, { target: { value: 'Pro plan pricing' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Switch chat, Pro plan pricing' })).toBeTruthy())
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
    openSwitcher(/Price increase|New conversation/)
    expect(within(switcher()).queryByText('Price increase')).toBeNull()
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

  it('has no axe violations closed, open with a live row, and on the home page', async () => {
    const { container } = renderHeader(CHATS, { chatId: 'a', running: true, step: 'Writing the report' })
    expect(await axe(container)).toHaveNoViolations()
    openSwitcher(/Price increase/)
    expect(await axe(document.body)).toHaveNoViolations()
    cleanup()
    nav.pathname = '/'
    const home = renderHeader()
    expect(await axe(home.container)).toHaveNoViolations()
  })
})
