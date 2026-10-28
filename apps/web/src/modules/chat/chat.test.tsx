// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from '@/test/axe'
import type { RunStatusState } from './use-run-status'

const chat = vi.hoisted(() => ({
  status: 'ready' as string,
  messages: [] as unknown[],
  stop: vi.fn(),
  resumeStream: vi.fn(),
  sendMessage: vi.fn(),
  options: undefined as undefined | { onError: (error: Error) => void; onFinish?: (arg: unknown) => void },
}))
const runState = vi.hoisted(() => ({ current: { status: 'none' } as RunStatusState, seeded: false }))
const runOpts = vi.hoisted(() => ({
  current: undefined as undefined | { enabled: boolean; sendCount?: number; initial?: RunStatusState },
}))
const composer = vi.hoisted(() => ({
  props: undefined as undefined | Record<string, unknown>,
  sent: undefined as undefined | Promise<string>,
}))
const upsertChat = vi.hoisted(() => vi.fn())

vi.mock('@ai-sdk/react', () => ({
  useChat: (options: { onError: (error: Error) => void; onFinish?: (arg: unknown) => void }) => {
    chat.options = options
    return {
      messages: chat.messages,
      sendMessage: chat.sendMessage,
      status: chat.status,
      stop: chat.stop,
      resumeStream: chat.resumeStream,
    }
  },
}))
vi.mock('./use-run-status', () => ({
  useRunStatus: (_chatId: string, opts: { enabled: boolean; sendCount?: number; initial?: RunStatusState }) => {
    runOpts.current = opts
    return runState.seeded && opts.initial ? opts.initial : runState.current
  },
}))
vi.mock('@/modules/sidebar/chat-list-context', () => ({
  useChatList: () => ({ chats: [], upsertChat, removeChat: vi.fn() }),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/c/c1',
}))
vi.mock('./composer/composer', async () => {
  const { useInterviewSelection } = await import('./interview-selection')
  return {
    Composer: (props: { onStop: () => void; onSend: (text: string, submit: unknown) => unknown }) => {
      composer.props = { ...props, selectionEnabled: useInterviewSelection()?.enabled }
      const send = (submit: unknown) => {
        composer.sent = Promise.resolve(props.onSend('why?', submit)).then(
          () => 'sent',
          (error: Error) => error.message,
        )
      }
      return (
        <>
          <button type="button" onClick={props.onStop}>
            Stop
          </button>
          <button type="button" onClick={() => send({ kind: 'followUp', target: 'report', agentIds: [] })}>
            Send follow-up
          </button>
          <button type="button" onClick={() => send({ kind: 'followUp', target: 'agents', agentIds: ['p1', 'p2'] })}>
            Send interview
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
  chat.messages = []
  runState.seeded = false
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

const limits = { demoMode: false, paused: false, maxRunsPerDay: 2, maxRounds: 40, allowPause: true }

const renderChat = (latestRun: LatestRun = null, over: Partial<typeof limits> = {}) =>
  render(
    <Chat chatId="c1" initialMessages={[]} activeRun={null} latestRun={latestRun} limits={{ ...limits, ...over }} />,
  )

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
    view.rerender(<Chat chatId="c1" initialMessages={[]} activeRun={null} latestRun={null} limits={limits} />)
    expect(chat.resumeStream).toHaveBeenCalledTimes(1)
  })

  it('retries the reattach on the next poll while still in error', async () => {
    chat.status = 'error'
    runState.current = { status: 'running', stage: 'sim_run', runId: 'r1', assistantMessageId: 'm1' }
    const view = renderChat()
    await waitFor(() => expect(chat.resumeStream).toHaveBeenCalledTimes(1))
    runState.current = { ...runState.current }
    view.rerender(<Chat chatId="c1" initialMessages={[]} activeRun={null} latestRun={null} limits={limits} />)
    await waitFor(() => expect(chat.resumeStream).toHaveBeenCalledTimes(2))
  })

  it('shows no send-error notice while the run is active', async () => {
    runState.current = { status: 'running', stage: 'sim_run', runId: 'r1', assistantMessageId: 'm1' }
    renderChat()
    await act(async () => chat.options!.onError(new Error('network down')))
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('shows the send-error notice when no run is active', async () => {
    renderChat()
    await act(async () => chat.options!.onError(new Error('network down')))
    expect(screen.getByRole('status').textContent).toBe('Something went wrong sending your message')
  })

  it('renders the thread with source chips on the first user turn and the question as the console title', () => {
    const question = 'How will customers react to a 20% price increase on our Pro plan next quarter, honestly?'
    chat.messages = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: question }] },
      {
        id: 'm1',
        role: 'assistant',
        parts: [
          {
            type: 'data-sources',
            data: { files: [{ id: 'f1', filename: 'brief.pdf', mediaType: 'application/pdf', sizeBytes: 10 }] },
          },
          { type: 'data-stage', data: { stage: 'ontology', status: 'running' } },
        ],
      },
    ]
    const { container } = renderChat()
    const user = screen.getByRole('group', { name: `You: ${question}` })
    expect(user.getAttribute('data-align')).toBe('end')
    expect(within(user).getByText('brief.pdf')).toBeTruthy()
    const assistant = screen.getByRole('group', { name: 'Xenet Opinions' })
    expect(within(assistant).queryByText('brief.pdf')).toBeNull()
    expect(within(assistant).getByText(question.slice(0, 60).trimEnd())).toBeTruthy()
    expect(container.querySelector('[data-slot="message-scroller-button"]')).not.toBeNull()
  })

  it('docks the composer under a scrolling thread', () => {
    const { container } = renderChat()
    const root = container.firstElementChild as HTMLElement
    expect(root.className).toContain('h-[calc(100dvh-3rem)]')
    expect(container.querySelector('[data-slot="message-scroller"]')?.className).toContain('min-h-0 flex-1')
  })

  it('uses run mode until a run is done', () => {
    renderChat()
    expect(composer.props).toMatchObject({ mode: 'run', selectionEnabled: false, allowPause: true })
  })

  it('switches to follow-up mode for a done run with no env badge', () => {
    renderChat(doneRun('open', inMinutes(10)))
    expect(composer.props).toMatchObject({ mode: 'followUp', selectionEnabled: false })
    expect(screen.queryByText(/Agents/)).toBeNull()
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('switches to follow-up mode when a new run finishes live, without a badge or persona selection', () => {
    runState.current = { status: 'done', runId: 'r1', envState: 'closed', envKeepaliveUntil: null }
    renderChat()
    expect(composer.props).toMatchObject({ mode: 'followUp', selectionEnabled: false })
    expect(screen.queryByText(/Agents/)).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('sends a follow-up to the report without polling the run or touching the sidebar', async () => {
    renderChat(doneRun('closed'))
    fireEvent.click(screen.getByRole('button', { name: 'Send follow-up' }))
    await waitFor(() =>
      expect(chat.sendMessage).toHaveBeenCalledWith({ text: 'why?' }, { body: { target: 'report', agentIds: [] } }),
    )
    expect(upsertChat).not.toHaveBeenCalled()
    expect(runOpts.current).toMatchObject({ enabled: false, sendCount: 0 })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  describe('during the interview window', () => {
    const paused: RunStatusState = {
      status: 'running',
      stage: 'interviews',
      runId: 'r1',
      assistantMessageId: 'm1',
      reportRequested: false,
    }

    beforeEach(() => {
      chat.status = 'streaming'
      runState.current = paused
    })

    it('uses interview mode with persona selection and an enabled composer', () => {
      renderChat()
      expect(composer.props).toMatchObject({ mode: 'interview', selectionEnabled: true, disabled: false })
    })

    const windowMessage = (until: string) => ({
      id: 'm1',
      role: 'assistant',
      parts: [
        { type: 'data-interview_window', id: 'interview_window', data: { until, personaCount: 3, closed: false } },
      ],
    })

    it('cancels the run from the window card', async () => {
      chat.messages = [windowMessage(inMinutes(20))]
      fetchSpy.mockResolvedValue(Response.json({ ok: true }))
      renderChat()
      fireEvent.click(screen.getByRole('button', { name: 'Cancel run' }))
      await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith('/api/chats/c1/run/cancel', { method: 'POST' }))
      await waitFor(() => expect(screen.getByText('Run cancelled', { selector: '[role="status"]' })).toBeTruthy())
    })

    it('shows the personas offline when the run failed without closing the window', () => {
      chat.status = 'ready'
      chat.messages = [windowMessage(inMinutes(20))]
      runState.current = { status: 'failed', stage: 'interviews', runId: 'r1', assistantMessageId: 'm1' }
      renderChat()
      expect(screen.getByText('Personas offline')).toBeTruthy()
      expect(screen.getByText('The run ended')).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'Generate report' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Cancel run' })).toBeNull()
    })

    it.each([
      [false, 'interview'],
      [true, 'run'],
    ])('seeds the mode from the loaded run (reportRequested %s)', (reportRequested, mode) => {
      runState.seeded = true
      const activeRun = {
        id: 'r1',
        assistantMessageId: 'm1',
        stage: 'interviews' as const,
        reportRequested,
        envKeepaliveUntil: inMinutes(15),
      }
      render(<Chat chatId="c1" initialMessages={[]} activeRun={activeRun} latestRun={null} limits={limits} />)
      expect(runOpts.current?.initial).toMatchObject({
        status: 'running',
        stage: 'interviews',
        reportRequested,
        envKeepaliveUntil: activeRun.envKeepaliveUntil,
      })
      expect(composer.props).toMatchObject({ mode, selectionEnabled: !reportRequested })
    })

    it('leaves interview mode once the report is requested', () => {
      runState.current = { ...paused, reportRequested: true }
      renderChat()
      expect(composer.props).toMatchObject({ mode: 'run', selectionEnabled: false, disabled: true })
    })

    it('posts the question as plain JSON, then reattaches once, never through sendMessage', async () => {
      fetchSpy.mockResolvedValue(Response.json({ questionId: 'q1', interviewIds: ['i1', 'i2'] }, { status: 202 }))
      renderChat()
      fireEvent.click(screen.getByRole('button', { name: 'Send interview' }))
      await waitFor(() => expect(chat.resumeStream).toHaveBeenCalledTimes(1))
      expect(await composer.sent).toBe('sent')
      expect(fetchSpy).toHaveBeenCalledTimes(1)
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('/api/chats/c1/messages')
      expect(init.method).toBe('POST')
      const body = JSON.parse(init.body as string)
      expect(body).toMatchObject({
        id: 'c1',
        target: 'agents',
        agentIds: ['p1', 'p2'],
        message: { role: 'user', parts: [{ type: 'text', text: 'why?' }] },
      })
      expect(body.message.id).toEqual(expect.any(String))
      expect(chat.sendMessage).not.toHaveBeenCalled()
      expect(upsertChat).not.toHaveBeenCalled()
      expect(screen.getByRole('status').textContent).toBe('')
    })

    it.each([
      ['window_closed', 409, 'The interview window has closed. The report is being generated.'],
      ['report_requested', 409, 'The report is being generated; no more interviews for this run.'],
      ['run_paused', 409, 'Pick personas to interview, or generate the report.'],
      ['invalid_body', 400, 'Something went wrong sending your message'],
    ])('maps a %s refusal to a notice and keeps the draft', async (code, status, text) => {
      fetchSpy.mockResolvedValue(Response.json({ error: code }, { status }))
      renderChat()
      fireEvent.click(screen.getByRole('button', { name: 'Send interview' }))
      await waitFor(() => expect(screen.getByRole('status').textContent).toBe(text))
      expect(await composer.sent).not.toBe('sent')
      expect(chat.resumeStream).not.toHaveBeenCalled()
      expect(chat.sendMessage).not.toHaveBeenCalled()
    })

    it('shows the generic notice when the request fails to reach the server', async () => {
      fetchSpy.mockRejectedValue(new TypeError('fetch failed'))
      renderChat()
      fireEvent.click(screen.getByRole('button', { name: 'Send interview' }))
      await waitFor(() =>
        expect(screen.getByRole('status').textContent).toBe('Something went wrong sending your message'),
      )
      expect(chat.resumeStream).not.toHaveBeenCalled()
    })
  })

  it('disables the composer while a follow-up streams', () => {
    chat.status = 'streaming'
    renderChat(doneRun('open', inMinutes(10)))
    expect(composer.props).toMatchObject({ disabled: true })
  })

  it.each([
    ['follow_up_failed', 'The report agent did not answer. Try again.'],
    ['follow_up_unavailable', 'Follow-ups are not available for this run.'],
  ])('maps the %s error to a notice', async (code, text) => {
    renderChat(doneRun('none'))
    await act(async () => chat.options!.onError(new Error(JSON.stringify({ error: code }))))
    expect(screen.getByRole('status').textContent).toBe(text)
  })

  it.each([
    ['demo_paused', 'The demo is paused right now. Try again later.'],
    ['quota_exceeded', "You've used today's two runs. Come back tomorrow."],
    ['rounds_exceeded', 'The demo allows up to 3 rounds.'],
  ])('shows the %s notice when sending fails', async (code, sentence) => {
    renderChat(null, { maxRounds: 3 })
    act(() => chat.options!.onError(new Error(JSON.stringify({ error: code }))))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe(sentence))
  })

  it('builds the quota and rounds notices from the limits', async () => {
    renderChat(null, { maxRunsPerDay: 5, maxRounds: 10 })
    act(() => chat.options!.onError(new Error('quota_exceeded')))
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe("You've used today's 5 runs. Come back tomorrow."),
    )
    act(() => chat.options!.onError(new Error('rounds_exceeded')))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('The demo allows up to 10 rounds.'))
  })

  it('shows the paused banner and disables the composer when paused', () => {
    renderChat(null, { paused: true })
    expect(screen.getByRole('status').textContent).toBe('The demo is paused')
    expect(composer.props?.disabled).toBe(true)
  })

  it('keeps follow-ups enabled while paused', () => {
    renderChat(doneRun('none'), { paused: true })
    expect(composer.props?.disabled).toBe(false)
  })

  it('keeps the status region mounted with no notice', () => {
    renderChat()
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('has no axe violations', async () => {
    const { container } = renderChat(doneRun('open', inMinutes(10)))
    await act(async () => chat.options!.onError(new Error(JSON.stringify({ error: 'follow_up_failed' }))))
    expect(await axe(container)).toHaveNoViolations()
  })
})
