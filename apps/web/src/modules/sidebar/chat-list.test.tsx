// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => '/c/a' }))

import { SidebarProvider } from '@/components/ui/sidebar'
import { ChatList } from './chat-list'
import { AppSidebar } from './app-sidebar'
import { ChatListProvider, useChatList, type ChatUpsert } from './chat-list-context'

vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))

afterEach(cleanup)

const renderList = (chats: Array<{ id: string; title: string; runStatus: 'none' | 'running' | 'done' | 'queued' }>, activeId?: string) =>
  render(
    <SidebarProvider>
      <ChatList chats={chats} activeId={activeId} />
    </SidebarProvider>,
  )

describe('ChatList', () => {
  it('renders titles and falls back for empty titles', () => {
    renderList([
      { id: 'a', title: 'Price increase', runStatus: 'none' },
      { id: 'b', title: '', runStatus: 'none' },
    ])
    expect(screen.getByText('Price increase')).toBeTruthy()
    expect(screen.getByText('New conversation')).toBeTruthy()
  })

  it('links each chat to its url', () => {
    renderList([{ id: 'a', title: 'Price increase', runStatus: 'none' }])
    expect(screen.getByRole('link', { name: /Price increase/ }).getAttribute('href')).toBe('/c/a')
  })

  it('shows a status dot only for active runs', () => {
    renderList([
      { id: 'a', title: 'Running one', runStatus: 'running' },
      { id: 'b', title: 'Finished', runStatus: 'done' },
      { id: 'c', title: 'Waiting', runStatus: 'queued' },
    ])
    expect(screen.getAllByTestId('run-status-dot')).toHaveLength(2)
  })
})

describe('ChatListProvider', () => {
  it('updates the rendered title and status dot on upsertChat without a remount', () => {
    let upsert: (chat: ChatUpsert) => void = () => {}
    const Grab = () => {
      upsert = useChatList().upsertChat
      return null
    }
    render(
      <SidebarProvider>
        <ChatListProvider chats={[{ id: 'a', title: '', runStatus: 'none' }]}>
          <AppSidebar />
          <Grab />
        </ChatListProvider>
      </SidebarProvider>,
    )
    expect(screen.getAllByText('New conversation')).toHaveLength(2)
    expect(screen.queryByTestId('run-status-dot')).toBeNull()
    act(() => upsert({ id: 'a', title: 'Price increase', runStatus: 'queued' }))
    expect(screen.getByText('Price increase')).toBeTruthy()
    expect(screen.getAllByTestId('run-status-dot')).toHaveLength(1)
    act(() => upsert({ id: 'a', runStatus: 'done' }))
    expect(screen.getByText('Price increase')).toBeTruthy()
    expect(screen.queryByTestId('run-status-dot')).toBeNull()
  })
})
