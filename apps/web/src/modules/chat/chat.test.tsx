// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { RunStatusState } from './use-run-status'

const chat = vi.hoisted(() => ({
  status: 'ready' as string,
  stop: vi.fn(),
  resumeStream: vi.fn(),
  sendMessage: vi.fn(),
  options: undefined as undefined | { onError: (error: Error) => void },
}))
const runState = vi.hoisted(() => ({ current: { status: 'none' } as RunStatusState }))

vi.mock('@ai-sdk/react', () => ({
  useChat: (options: { onError: (error: Error) => void }) => {
    chat.options = options
    return { messages: [], sendMessage: chat.sendMessage, status: chat.status, stop: chat.stop, resumeStream: chat.resumeStream }
  },
}))
vi.mock('./use-run-status', () => ({ useRunStatus: () => runState.current }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }), usePathname: () => '/c/c1' }))
vi.mock('@/components/ai-elements/conversation', () => ({
  Conversation: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ConversationContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ConversationScrollButton: () => null,
}))
vi.mock('./composer/composer', () => ({
  Composer: ({ onStop }: { onStop: () => void }) => (
    <button type="button" onClick={onStop}>
      Stop
    </button>
  ),
}))

import { Chat } from './chat'

const fetchSpy = vi.fn()

beforeEach(() => {
  chat.status = 'ready'
  chat.stop.mockReset()
  chat.resumeStream.mockReset()
  runState.current = { status: 'none' }
  fetchSpy.mockReset()
  vi.stubGlobal('fetch', fetchSpy)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const renderChat = () => render(<Chat chatId="c1" initialMessages={[]} activeRun={null} />)

describe('Chat', () => {
  it('cancels the run when stopping a fresh stream before the poll sees it, without stopping the tail', async () => {
    chat.status = 'streaming'
    fetchSpy.mockResolvedValue(Response.json({ runId: 'r1' }))
    renderChat()
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Run cancelled'))
    expect(fetchSpy).toHaveBeenCalledWith('/api/chats/c1/run/cancel', { method: 'POST' })
    expect(chat.stop).not.toHaveBeenCalled()
  })

  it('stops the stream and shows a notice when the cancel fails', async () => {
    chat.status = 'streaming'
    fetchSpy.mockResolvedValue(Response.json({ error: 'run_not_active' }, { status: 409 }))
    renderChat()
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('The run has already finished'))
    expect(chat.stop).toHaveBeenCalledTimes(1)
  })

  it('only stops locally when nothing is active', async () => {
    renderChat()
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    await waitFor(() => expect(chat.stop).toHaveBeenCalledTimes(1))
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('reattaches once when the stream errored while the run is still running', async () => {
    chat.status = 'error'
    runState.current = { status: 'running', stage: 'sim_run', runId: 'r1', assistantMessageId: 'm1' }
    const view = renderChat()
    await waitFor(() => expect(chat.resumeStream).toHaveBeenCalledTimes(1))
    view.rerender(<Chat chatId="c1" initialMessages={[]} activeRun={null} />)
    expect(chat.resumeStream).toHaveBeenCalledTimes(1)
  })

  it('retries the reattach on the next poll while still in error', async () => {
    chat.status = 'error'
    runState.current = { status: 'running', stage: 'sim_run', runId: 'r1', assistantMessageId: 'm1' }
    const view = renderChat()
    await waitFor(() => expect(chat.resumeStream).toHaveBeenCalledTimes(1))
    runState.current = { ...runState.current }
    view.rerender(<Chat chatId="c1" initialMessages={[]} activeRun={null} />)
    await waitFor(() => expect(chat.resumeStream).toHaveBeenCalledTimes(2))
  })

  it('shows no send-error notice while the run is active', async () => {
    runState.current = { status: 'running', stage: 'sim_run', runId: 'r1', assistantMessageId: 'm1' }
    renderChat()
    await act(async () => chat.options!.onError(new Error('network down')))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('shows the send-error notice when no run is active', async () => {
    renderChat()
    await act(async () => chat.options!.onError(new Error('network down')))
    expect(screen.getByRole('status').textContent).toBe('Something went wrong sending your message')
  })
})
