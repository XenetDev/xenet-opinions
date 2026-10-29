// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from '@/test/axe'

const nav = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: nav.push }) }))

import { type ChatListItem, ChatListProvider } from '../chat-list-context'
import { ChatPalette } from './chat-palette'

const chat = (id: string, title: string, day: number): ChatListItem => ({
  id,
  title,
  runStatus: 'done',
  updatedAt: new Date(Date.UTC(2026, 0, day)).toISOString(),
})

const CHATS = [chat('a', 'Price increase', 1), chat('b', 'Coffee shop pricing', 3), chat('c', 'Hiring plan', 2)]

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

const onOpenChange = vi.fn()

const renderPalette = (chats = CHATS) => {
  onOpenChange.mockReset()
  return render(
    <ChatListProvider chats={chats}>
      <ChatPalette open onOpenChange={onOpenChange} />
    </ChatListProvider>,
  )
}

const chatRows = () => screen.getAllByRole('option').filter((o) => o.textContent !== 'New chat')

describe('ChatPalette', () => {
  it('lists chats newest first under Actions and Chats', () => {
    renderPalette()
    expect(screen.getByRole('dialog', { name: 'Search chats' })).toBeTruthy()
    expect(screen.getByPlaceholderText('Search chats…')).toBeTruthy()
    expect(screen.getByText('Actions')).toBeTruthy()
    expect(screen.getByText('Chats')).toBeTruthy()
    expect(chatRows().map((o) => o.textContent)).toEqual(['Coffee shop pricing', 'Hiring plan', 'Price increase'])
  })

  it('widens the dialog and truncates titles', () => {
    renderPalette()
    expect(screen.getByRole('dialog').className).toContain('sm:max-w-xl')
    expect(screen.getByText('Hiring plan').className).toContain('truncate')
  })

  it('filters by title case-insensitively and keeps New chat', () => {
    renderPalette()
    fireEvent.change(screen.getByPlaceholderText('Search chats…'), { target: { value: 'COFFEE' } })
    expect(chatRows().map((o) => o.textContent)).toEqual(['Coffee shop pricing'])
    expect(screen.getByRole('option', { name: 'New chat' })).toBeTruthy()
  })

  it('opens the chat on Enter and closes', () => {
    renderPalette()
    const input = screen.getByPlaceholderText('Search chats…')
    fireEvent.change(input, { target: { value: 'hiring' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(nav.push).toHaveBeenCalledWith('/c/c')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('starts a new chat from the action', () => {
    renderPalette()
    fireEvent.click(screen.getByRole('option', { name: 'New chat' }))
    expect(nav.push).toHaveBeenCalledWith('/')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('keeps the top match selected as the query grows', () => {
    renderPalette()
    const input = screen.getByPlaceholderText('Search chats…')
    fireEvent.change(input, { target: { value: 'p' } })
    fireEvent.change(input, { target: { value: 'pr' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(nav.push).toHaveBeenCalledWith('/c/b')
  })

  it('clears the query after a selection', () => {
    renderPalette()
    const input = screen.getByPlaceholderText('Search chats…') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'hiring' } })
    fireEvent.click(chatRows()[0] as HTMLElement)
    expect(input.value).toBe('')
  })

  it('says so when nothing matches', () => {
    renderPalette()
    fireEvent.change(screen.getByPlaceholderText('Search chats…'), { target: { value: 'zzz' } })
    expect(screen.getByText('No chats match')).toBeTruthy()
  })

  it('says no chats yet when there are none and nothing is typed', () => {
    renderPalette([])
    expect(screen.getByText('No chats yet')).toBeTruthy()
    expect(screen.queryByText('No chats match')).toBeNull()
    fireEvent.change(screen.getByPlaceholderText('Search chats…'), { target: { value: 'zzz' } })
    expect(screen.getByText('No chats match')).toBeTruthy()
  })

  it('shows at most 50 chats', () => {
    renderPalette(Array.from({ length: 60 }, (_, i) => chat(`id${i}`, `Chat ${i}`, 1 + (i % 28))))
    expect(chatRows()).toHaveLength(50)
  })

  it('has no axe violations', async () => {
    renderPalette()
    expect((await axe(document.body)).violations).toEqual([])
  })
})
