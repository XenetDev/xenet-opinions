import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./runs', () => ({ runStore: { createInterviews: vi.fn(), transition: vi.fn() } }))
vi.mock('./roster', () => ({ loadRoster: vi.fn() }))

import { createInterviewQuestion, InterviewWindowError } from './interview-window'
import { loadRoster } from './roster'
import { runStore } from './runs'

const now = new Date('2026-10-27T10:00:00.000Z')
const run = (over: Record<string, unknown> = {}) =>
  ({
    id: 'r1',
    chatId: 'c1',
    assistantMessageId: 'a1',
    status: 'running',
    stage: 'interviews',
    cursors: { interviewsStartedAt: '2026-10-27T09:50:00.000Z' },
    envKeepaliveUntil: new Date('2026-10-27T10:10:00.000Z'),
    ...over,
  }) as never

const ask = (agentIds: string[], over: Record<string, unknown> = {}) =>
  createInterviewQuestion({ run: run(over), agentIds, text: 'Why?', now })

const code = async (promise: Promise<unknown>) => {
  const error = await promise.catch((e) => e)
  expect(error).toBeInstanceOf(InterviewWindowError)
  return (error as InterviewWindowError).code
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(loadRoster).mockResolvedValue([
    { id: '1', name: 'Ada' },
    { id: '2', name: 'Bo' },
  ])
})

describe('createInterviewQuestion refusals', () => {
  it.each([[[]], [['1', '1']], [['1', '9']], [['1', '2', '3', '4', '5', '6']]])(
    'rejects agent ids %j as invalid_body',
    async (ids) => {
      expect(await code(ask(ids))).toBe('invalid_body')
      expect(runStore.createInterviews).not.toHaveBeenCalled()
    },
  )

  it('refuses once the report was requested', async () => {
    expect(await code(ask(['1'], { cursors: { reportRequested: true } }))).toBe('report_requested')
    expect(runStore.createInterviews).not.toHaveBeenCalled()
  })

  it.each([[new Date('2026-10-27T10:00:00.000Z')], [null]])('refuses when the window closed at %s', async (until) => {
    expect(await code(ask(['1'], { envKeepaliveUntil: until }))).toBe('window_closed')
    expect(runStore.createInterviews).not.toHaveBeenCalled()
  })
})
