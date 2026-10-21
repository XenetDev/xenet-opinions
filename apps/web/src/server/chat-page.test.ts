import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listMessages: vi.fn(),
  toUIMessages: vi.fn(),
  getActiveByChat: vi.fn(),
  getLatestByChat: vi.fn(),
  materialiseRun: vi.fn(),
}))

vi.mock('@/server/chats', () => ({ listMessages: mocks.listMessages }))
vi.mock('@/server/ui-message', () => ({ toUIMessages: mocks.toUIMessages }))
vi.mock('@/server/runs', () => ({
  runStore: { getActiveByChat: mocks.getActiveByChat, getLatestByChat: mocks.getLatestByChat },
}))
vi.mock('@xo/engine', () => ({ materialiseRun: mocks.materialiseRun }))

import { loadChatPage } from './chat-page'

const user = { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }
const assistant = (parts: unknown[]) => ({ id: 'a1', role: 'assistant', parts })

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset())
  mocks.listMessages.mockResolvedValue([])
  mocks.getActiveByChat.mockResolvedValue(null)
  mocks.getLatestByChat.mockResolvedValue(null)
})

describe('loadChatPage', () => {
  it('drops the in-flight assistant row and returns the active run', async () => {
    mocks.toUIMessages.mockReturnValue([user, assistant([])])
    mocks.getActiveByChat.mockResolvedValue({ id: 'r1', assistantMessageId: 'a1', stage: 'ontology', status: 'running' })
    const page = await loadChatPage('c1', 'u1')
    expect(page.initialMessages).toEqual([user])
    expect(page.activeRun).toEqual({ id: 'r1', assistantMessageId: 'a1', stage: 'ontology' })
    expect(mocks.materialiseRun).not.toHaveBeenCalled()
  })

  it('materialises a terminal run whose assistant row is empty', async () => {
    const parts = [{ type: 'text', text: 'done' }]
    mocks.toUIMessages.mockReturnValue([user, assistant([])])
    mocks.getLatestByChat.mockResolvedValue({ id: 'r1', assistantMessageId: 'a1', status: 'done' })
    mocks.materialiseRun.mockResolvedValue(parts)
    const page = await loadChatPage('c1', 'u1')
    expect(mocks.materialiseRun).toHaveBeenCalledWith(expect.anything(), 'r1')
    expect(page.initialMessages).toEqual([user, assistant(parts)])
    expect(page.activeRun).toBeNull()
  })

  it('does not materialise when the assistant row already has parts', async () => {
    mocks.toUIMessages.mockReturnValue([user, assistant([{ type: 'text', text: 'x' }])])
    mocks.getLatestByChat.mockResolvedValue({ id: 'r1', assistantMessageId: 'a1', status: 'done' })
    const page = await loadChatPage('c1', 'u1')
    expect(mocks.materialiseRun).not.toHaveBeenCalled()
    expect(page.initialMessages).toHaveLength(2)
  })

  it('returns messages unchanged when there are no runs', async () => {
    mocks.toUIMessages.mockReturnValue([user])
    const page = await loadChatPage('c1', 'u1')
    expect(page).toEqual({ initialMessages: [user], activeRun: null })
  })
})
