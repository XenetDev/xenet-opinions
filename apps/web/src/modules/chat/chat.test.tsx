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
  options: undefined as undefined | { onError: (error: Error) => void; onFinish?: (arg: unknown) => void },
}))
const runState = vi.hoisted(() => ({ current: { status: 'none' } as RunStatusState }))
const runOpts = vi.hoisted(() => ({ current: undefined as undefined | { enabled: boolean; sendCount?: number } }))
const composer = vi.hoisted(() => ({ props: undefined as undefined | Record<string, unknown> }))
const upsertChat = vi.hoisted(() => vi.fn())

vi.mock('@ai-sdk/react', () => ({
  useChat: (options: { onError: (error: Error) => void; onFinish?: (arg: unknown) => void }) => {
    chat.options = options
    return { messages: [], sendMessage: chat.sendMessage, status: chat.status, stop: chat.stop, resumeStream: chat.resumeStream }
  },
}))
vi.mock('./use-run-status', () => ({
  useRunStatus: (_chatId: string, opts: { enabled: boolean; sendCount?: number }) => {
    runOpts.current = opts
    return runState.current
  },
}))
vi.mock('@/modules/sidebar/chat-list-context', () => ({ useChatList: () => ({ chats: [], upsertChat, removeChat: vi.fn() }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }), usePathname: () => '/c/c1' }))
vi.mock('@/components/ai-elements/conversation', () => ({
  Conversation: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ConversationContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ConversationScrollButton: () => null,
}))
vi.mock('./composer/composer', async () => {
  const { useInterviewSelection } = await import('./interview-selection')
  return {
    Composer: (props: { onStop: () => void; onSend: (text: string, submit: unknown) => void }) => {
      composer.props = { ...props, selectionEnabled: useInterviewSelection()?.enabled }
      return (
        <>
          <button type="button" onClick={props.onStop}>
            Stop
          </button>
          <button type="button" onClick={() => props.onSend('why?', { kind: 'followUp', target: 'agents', agentIds: ['p1'] })}>
            Send follow-up
          </button>
        </>
      )
    },
  }
})

import { Chat } from './chat'

type LatestRun = Parameters<typeof Chat>[0]['latestRun']
const doneRun = (envState: 'none' | 'open' | 'closed', envKeepaliveUntil: string | null = null): LatestRun => ({
  id: 'r1',
  status: 'done',
  assistantMessageId: 'm1',
  envState,
  envKeepaliveUntil,
})
const inMinutes = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString()

const fetchSpy = vi.fn()

beforeEach(() => {
  chat.status = 'ready'
  chat.stop.mockReset()
  chat.resumeStream.mockReset()
  chat.sendMessage.mockReset()
  upsertChat.mockReset()
  runState.current = { status: 'none' }
  fetchSpy.mockReset()
  vi.stubGlobal('fetch', fetchSpy)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const renderChat = (latestRun: LatestRun = null) =>
  render(<Chat chatId="c1" initialMessages={[]} activeRun={null} latestRun={latestRun} />)

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

  it('only stops the stream when stopping a follow-up reply', async () => {
    chat.status = 'streaming'
    renderChat(doneRun('none'))
    const statuses = () => screen.queryAllByRole('status').map((el) => el.textContent)
    const before = statuses()
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    await waitFor(() => expect(chat.stop).toHaveBeenCalledTimes(1))
    await act(async () => {})
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(statuses()).toEqual(before)
  })

  it('reattaches once when the stream errored while the run is still running', async () => {
    chat.status = 'error'
    runState.current = { status: 'running', stage: 'sim_run', runId: 'r1', assistantMessageId: 'm1' }
    const view = renderChat()
    await waitFor(() => expect(chat.resumeStream).toHaveBeenCalledTimes(1))
    view.rerender(<Chat chatId="c1" initialMessages={[]} activeRun={null} latestRun={null} />)
    expect(chat.resumeStream).toHaveBeenCalledTimes(1)
  })

  it('retries the reattach on the next poll while still in error', async () => {
    chat.status = 'error'
    runState.current = { status: 'running', stage: 'sim_run', runId: 'r1', assistantMessageId: 'm1' }
    const view = renderChat()
    await waitFor(() => expect(chat.resumeStream).toHaveBeenCalledTimes(1))
    runState.current = { ...runState.current }
    view.rerender(<Chat chatId="c1" initialMessages={[]} activeRun={null} latestRun={null} />)
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

  it('uses run mode until a run is done', () => {
    renderChat()
    expect(composer.props).toMatchObject({ mode: 'run', envOpen: false })
  })

  it('switches to follow-up mode for a loaded done run and shows the env badge', () => {
    renderChat(doneRun('open', inMinutes(10)))
    expect(composer.props).toMatchObject({ mode: 'followUp', envOpen: true })
    expect(screen.getByRole('status').textContent).toBe('Agents available for 10 min')
  })

  it('switches to follow-up mode with the env from the poll when a new run finishes live', () => {
    runState.current = { status: 'done', runId: 'r1', envState: 'open', envKeepaliveUntil: inMinutes(10) }
    renderChat()
    expect(composer.props).toMatchObject({ mode: 'followUp', envOpen: true, selectionEnabled: true })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('opens the env when the run active at page load finishes live', () => {
    const activeRun = { id: 'r1', assistantMessageId: 'm1', stage: 'sim_run' as const }
    const latestRun = { id: 'r1', status: 'running', assistantMessageId: 'm1', envState: 'none' as const, envKeepaliveUntil: null }
    runState.current = { status: 'running', stage: 'sim_run', runId: 'r1', assistantMessageId: 'm1' }
    const view = render(<Chat chatId="c1" initialMessages={[]} activeRun={activeRun} latestRun={latestRun} />)
    expect(composer.props).toMatchObject({ mode: 'run', envOpen: false, selectionEnabled: false })
    runState.current = { status: 'done', runId: 'r1', assistantMessageId: 'm1', envState: 'open', envKeepaliveUntil: inMinutes(10) }
    view.rerender(<Chat chatId="c1" initialMessages={[]} activeRun={activeRun} latestRun={latestRun} />)
    expect(screen.getByRole('status').textContent).toBe('Agents available for 10 min')
    expect(composer.props).toMatchObject({ mode: 'followUp', envOpen: true, selectionEnabled: true })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('sends a follow-up without polling the run or touching the sidebar', async () => {
    renderChat(doneRun('open', inMinutes(10)))
    fireEvent.click(screen.getByRole('button', { name: 'Send follow-up' }))
    await waitFor(() =>
      expect(chat.sendMessage).toHaveBeenCalledWith({ text: 'why?' }, { body: { target: 'agents', agentIds: ['p1'] } }),
    )
    expect(upsertChat).not.toHaveBeenCalled()
    expect(runOpts.current).toMatchObject({ enabled: false, sendCount: 0 })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('refreshes the env status when a follow-up finishes', async () => {
    fetchSpy.mockResolvedValue(Response.json({ status: 'done', envState: 'closed', envKeepaliveUntil: null }))
    renderChat(doneRun('open', inMinutes(10)))
    await act(async () => chat.options!.onFinish?.({}))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Agents offline'))
    expect(fetchSpy).toHaveBeenCalledWith('/api/chats/c1/run', expect.anything())
    expect(composer.props).toMatchObject({ envOpen: false })
  })

  it('disables the composer while a follow-up streams', () => {
    chat.status = 'streaming'
    renderChat(doneRun('open', inMinutes(10)))
    expect(composer.props).toMatchObject({ disabled: true })
  })

  it.each([
    ['env_closed', 'The personas for this conversation are offline now. You can still ask the report.'],
    ['follow_up_failed', 'The report agent did not answer. Try again.'],
    ['follow_up_unavailable', 'Follow-ups are not available for this run.'],
  ])('maps the %s error to a notice', async (code, text) => {
    fetchSpy.mockResolvedValue(Response.json({ status: 'done', envState: 'none', envKeepaliveUntil: null }))
    renderChat(doneRun('none'))
    await act(async () => chat.options!.onError(new Error(JSON.stringify({ error: code }))))
    expect(screen.getByRole('status').textContent).toBe(text)
  })
})
