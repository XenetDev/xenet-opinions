// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { ChatListProvider, useChatList } from './chat-list-context'

const old = '2026-10-01T10:00:00.000Z'
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(ChatListProvider, { chats: [{ id: 'a', title: 'Old', runStatus: 'done', updatedAt: old }], children })

describe('ChatListProvider', () => {
  it('stamps updatedAt to now when a run is queued, and only then', () => {
    const { result } = renderHook(() => useChatList(), { wrapper })
    act(() => result.current.upsertChat({ id: 'a', title: 'Renamed' }))
    expect(result.current.chats[0]?.updatedAt).toBe(old)
    const before = Date.now()
    act(() => result.current.upsertChat({ id: 'a', runStatus: 'queued' }))
    expect(new Date(result.current.chats[0]?.updatedAt ?? old).getTime()).toBeGreaterThanOrEqual(before)
    const stamped = result.current.chats[0]?.updatedAt
    act(() => result.current.upsertChat({ id: 'a', runStatus: 'done' }))
    expect(result.current.chats[0]?.updatedAt).toBe(stamped)
  })

  it('adds an unknown chat at the top with the current time', () => {
    const { result } = renderHook(() => useChatList(), { wrapper })
    act(() => result.current.upsertChat({ id: 'b', title: 'New', runStatus: 'queued' }))
    expect(result.current.chats.map((chat) => chat.id)).toEqual(['b', 'a'])
    expect(Date.now() - new Date(result.current.chats[0]?.updatedAt ?? old).getTime()).toBeLessThan(5_000)
  })
})
