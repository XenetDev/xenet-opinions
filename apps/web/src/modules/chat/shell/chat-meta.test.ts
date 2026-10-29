import { describe, expect, it } from 'vitest'
import type { ChatListItem } from '../chat-list-context'
import { chatTitle, groupChatsByDay, isRunning } from './chat-meta'

const now = new Date(2026, 9, 29, 10, 0)

const chat = (id: string, date: Date): ChatListItem => ({
  id,
  title: id,
  runStatus: 'done',
  updatedAt: date.toISOString(),
})

describe('groupChatsByDay', () => {
  it('buckets chats by age and labels older months', () => {
    const groups = groupChatsByDay(
      [
        chat('today', new Date(2026, 9, 29, 9, 0)),
        chat('yesterday', new Date(2026, 9, 28, 23, 0)),
        chat('week', new Date(2026, 9, 24, 12, 0)),
        chat('month', new Date(2026, 9, 9, 12, 0)),
        chat('august', new Date(2026, 7, 3, 12, 0)),
        chat('december', new Date(2025, 11, 24, 12, 0)),
      ],
      now,
    )
    expect(groups.map((g) => [g.label, g.chats.map((c) => c.id)])).toEqual([
      ['Today', ['today']],
      ['Yesterday', ['yesterday']],
      ['Previous 7 days', ['week']],
      ['Previous 30 days', ['month']],
      ['August 2026', ['august']],
      ['December 2025', ['december']],
    ])
  })

  it('sorts newest first inside a group', () => {
    const groups = groupChatsByDay(
      [chat('early', new Date(2026, 9, 29, 1, 0)), chat('late', new Date(2026, 9, 29, 8, 0))],
      now,
    )
    expect(groups[0]?.chats.map((c) => c.id)).toEqual(['late', 'early'])
  })

  it('returns no groups for empty input', () => {
    expect(groupChatsByDay([], now)).toEqual([])
  })
})

describe('chatTitle', () => {
  it('falls back for empty titles', () => {
    expect(chatTitle({ title: '' })).toBe('New conversation')
    expect(chatTitle({ title: 'Hi' })).toBe('Hi')
  })
})

describe('isRunning', () => {
  it('is true for queued and running only', () => {
    expect(isRunning('queued')).toBe(true)
    expect(isRunning('running')).toBe(true)
    expect(isRunning('done')).toBe(false)
    expect(isRunning(undefined)).toBe(false)
  })
})
