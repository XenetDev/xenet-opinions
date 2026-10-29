// @vitest-environment jsdom

import { act, cleanup, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { SidebarProvider } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { axe } from '@/test/axe'

import { type ChatListItem, ChatListProvider, type ChatUpsert, useChatList } from '../chat-list-context'
import { History } from './history'

afterEach(cleanup)

const midnight = new Date()
midnight.setHours(0, 0, 0, 0)
const at = (offsetMs: number) => new Date(midnight.getTime() + offsetMs).toISOString()
const HOUR = 3_600_000
const DAY = 24 * HOUR
const old = new Date(midnight.getTime() - 90 * DAY)
const oldLabel = old.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

const CHATS: ChatListItem[] = [
  { id: 'old', title: 'Old one', runStatus: 'done', updatedAt: old.toISOString() },
  { id: 'y', title: 'Yesterday chat', runStatus: 'done', updatedAt: at(-12 * HOUR) },
  { id: 'a', title: 'Price increase', runStatus: 'running', updatedAt: at(2_000) },
  { id: 'b', title: '', runStatus: 'done', updatedAt: at(1_000) },
  { id: 'w', title: 'Week chat', runStatus: 'queued', updatedAt: at(-3 * DAY) },
  { id: 'm', title: 'Month chat', runStatus: 'none', updatedAt: at(-20 * DAY) },
]

let upsert: (chat: ChatUpsert) => void = () => {}

function Harness({
  activeId,
  activeRunning = false,
  guest,
}: {
  activeId?: string
  activeRunning?: boolean
  guest?: boolean
}) {
  const list = useChatList()
  upsert = list.upsertChat
  return <History chats={list.chats} activeId={activeId} activeRunning={activeRunning} guest={guest} />
}

const wrap = (node: ReactNode, chats: ChatListItem[] = CHATS) => (
  <TooltipProvider>
    <SidebarProvider>
      <ChatListProvider chats={chats}>{node}</ChatListProvider>
    </SidebarProvider>
  </TooltipProvider>
)

const labels = () =>
  Array.from(screen.getByTestId('history').querySelectorAll('[data-sidebar="group-label"]')).map((el) => el.textContent)
const rowsIn = (label: string) => {
  const group = Array.from(screen.getByTestId('history').querySelectorAll('[data-sidebar="group"]')).find(
    (el) => el.querySelector('[data-sidebar="group-label"]')?.textContent === label,
  )
  if (!(group instanceof HTMLElement)) throw new Error(`no group ${label}`)
  return within(group).getAllByRole('link')
}

describe('History', () => {
  it('renders day groups in order with their labels and rows newest first', () => {
    render(wrap(<Harness />))
    expect(labels()).toEqual(['Today', 'Yesterday', 'Previous 7 days', 'Previous 30 days', oldLabel])
    expect(rowsIn('Today').map((row) => row.textContent)).toEqual(['Price increase', 'New conversation'])
    expect(rowsIn('Today')[0]?.getAttribute('href')).toBe('/c/a')
  })

  it('marks the active row as the current page', () => {
    render(wrap(<Harness activeId="b" />))
    const active = screen.getByRole('link', { name: 'New conversation' })
    expect(active.getAttribute('aria-current')).toBe('page')
    expect(active.getAttribute('data-active')).toBe('true')
    expect(screen.getByRole('link', { name: /Price increase/ }).getAttribute('aria-current')).toBeNull()
  })

  it('shows the Working dot on queued and running rows only', () => {
    render(wrap(<Harness />))
    expect(
      within(screen.getByRole('link', { name: /Price increase/ })).getByRole('img', { name: 'Working' }),
    ).toBeTruthy()
    expect(within(screen.getByRole('link', { name: /Week chat/ })).getByRole('img', { name: 'Working' })).toBeTruthy()
    expect(screen.getAllByRole('img', { name: 'Working' })).toHaveLength(2)
  })

  it('shows the dot on the active row while its live run is going', () => {
    render(wrap(<Harness activeId="b" activeRunning />))
    expect(
      within(screen.getByRole('link', { name: /New conversation/ })).getByRole('img', { name: 'Working' }),
    ).toBeTruthy()
  })

  it('drops the dot when a run ends', () => {
    render(wrap(<Harness />))
    act(() => upsert({ id: 'a', runStatus: 'done' }))
    expect(within(screen.getByRole('link', { name: 'Price increase' })).queryByRole('img')).toBeNull()
  })

  it('moves a chat re-upserted as queued to the top of Today', () => {
    render(wrap(<Harness />))
    act(() => upsert({ id: 'm', runStatus: 'queued' }))
    expect(rowsIn('Today')[0]?.textContent).toContain('Month chat')
    expect(labels()).not.toContain('Previous 30 days')
  })

  it('says there are no chats yet', () => {
    render(wrap(<Harness />, []))
    expect(screen.getByText('No chats yet')).toBeTruthy()
    expect(screen.queryByText('Chats on this device only. Sign in to keep them.')).toBeNull()
  })

  it('tells guests their chats stay on this device', async () => {
    const { container } = render(wrap(<Harness guest />, []))
    expect(screen.getByText('No chats yet')).toBeTruthy()
    expect(screen.getByText('Chats on this device only. Sign in to keep them.')).toBeTruthy()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('renders three skeleton rows before mount', () => {
    const html = renderToString(wrap(<Harness />))
    expect(html.match(/data-sidebar="menu-skeleton"/g)).toHaveLength(3)
    expect(html).not.toContain('Price increase')
  })

  it('has no axe violations', async () => {
    const { container } = render(wrap(<Harness activeId="a" />))
    expect(await axe(container)).toHaveNoViolations()
  })
})
