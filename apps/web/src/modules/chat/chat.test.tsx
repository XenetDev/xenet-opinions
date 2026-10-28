// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from '@/test/axe'
import type { RunStatusState } from './use-run-status'

const chat = vi.hoisted(() => ({
  real: false,
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

vi.mock('@ai-sdk/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ai-sdk/react')>()
  const stubChat = () => ({
    messages: chat.messages,
    sendMessage: chat.sendMessage,
    status: chat.status,
    stop: chat.stop,
    resumeStream: chat.resumeStream,
  })
  return {
    useChat: (options: { onError: (error: Error) => void; onFinish?: (arg: unknown) => void }) => {
      chat.options = options
      return (chat.real ? actual.useChat : stubChat)(options as never)
    },
  }
})
vi.mock('./use-run-status', () => ({
  useRunStatus: (_chatId: string, opts: { enabled: boolean; sendCount?: number; initial?: RunStatusState }) => {
    runOpts.current = opts
    return runState.seeded && opts.initial ? opts.initial : runState.current
  },
}))
vi.mock('@/modules/chat/chat-list-context', () => ({
  useChatList: () => ({ chats: [], upsertChat, removeChat: vi.fn() }),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/c/c1',
}))
const promptOnly = { kind: 'run', uploadIds: [], runOptions: { maxRounds: 1, pauseForInterviews: false } }
const LONG_PROMPT = Array.from({ length: 40 }, (_, index) => `word${index}`).join(' ')

vi.mock('./composer/composer', async () => {
  const { useInterviewSelection } = await import('./interview-selection')
  return {
    Composer: (props: { onStop: () => void; onSend: (text: string, submit: unknown) => unknown }) => {
      composer.props = { ...props, selectionEnabled: useInterviewSelection()?.enabled }
      const send = (submit: unknown, text = 'why?') => {
        composer.sent = Promise.resolve(props.onSend(text, submit)).then(
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
          <button
            type="button"
            onClick={() =>
              send({ kind: 'run', uploadIds: ['u1'], runOptions: { maxRounds: 1, pauseForInterviews: false } })
            }
          >
            Send run
          </button>
          <button type="button" onClick={() => send(promptOnly)}>
            Send prompt-only run
          </button>
          <button type="button" onClick={() => send(promptOnly, 'and if prices fall?')}>
            Send another prompt-only run
          </button>
          <button type="button" onClick={() => send(promptOnly, LONG_PROMPT)}>
            Send long prompt-only run
          </button>
          <button type="button" onClick={() => send({ ...promptOnly, uploadIds: ['u1'] }, 'short')}>
            Send short run with a file
          </button>
        </>
      )
    },
  }
})

import { Chat } from './chat'
import { type ChatActivity, ChatActivityProvider, useChatActivity } from './chat-activity'

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
  chat.real = false
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

const limits = {
  demoMode: false,
  paused: false,
  maxRunsPerDay: 2,
  signedInMaxRunsPerDay: 3,
  anonymous: false,
  maxRounds: 40,
  allowPause: true,
}

const seen: (ChatActivity | null)[] = []
const Spy = () => {
  seen.push(useChatActivity().activity)
  return null
}
const Harness = ({ open }: { open: boolean }) => (
  <ChatActivityProvider>
    {open && <Chat chatId="c1" initialMessages={[]} activeRun={null} latestRun={null} limits={limits} />}
    <Spy />
  </ChatActivityProvider>
)

const Other = () => {
  const { setActivity } = useChatActivity()
  return (
    <button type="button" onClick={() => setActivity({ chatId: 'c2', running: true })}>
      Other chat
    </button>
  )
}
const OtherHarness = ({ open }: { open: boolean }) => (
  <ChatActivityProvider>
    {open && <Chat chatId="c1" initialMessages={[]} activeRun={null} latestRun={null} limits={limits} />}
    <Other />
    <Spy />
  </ChatActivityProvider>
)

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

  it('renders the resumed turn of a run that already failed when the page loaded it as active', async () => {
    chat.real = true
    runState.current = { status: 'failed', stage: 'ontology', runId: 'r1', assistantMessageId: 'a1' }
    const chunks = [
      { type: 'start', messageId: 'a1' },
      { type: 'data-stage', id: 'stage:ontology', data: { stage: 'ontology', status: 'running' } },
      {
        type: 'data-sources',
        data: { files: [{ id: 'u1', filename: 'brief.txt', mediaType: 'text/plain', sizeBytes: 5 }] },
      },
      { type: 'data-stage', id: 'stage:ontology', data: { stage: 'ontology', status: 'failed' } },
      { type: 'error', errorText: 'Injected failure' },
      { type: 'finish' },
    ]
    fetchSpy.mockImplementation(
      async () =>
        new Response(`${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('')}data: [DONE]\n\n`, {
          headers: { 'content-type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' },
        }),
    )
    const { container } = render(
      <Chat
        chatId="c1"
        initialMessages={[{ id: 'u0', role: 'user', parts: [{ type: 'text', text: 'How will people react?' }] }]}
        activeRun={{ id: 'r1', assistantMessageId: 'a1', stage: 'ontology' }}
        latestRun={null}
        limits={limits}
      />,
    )
    await waitFor(() => expect(container.querySelector('[data-part="console"]')).toBeTruthy())
    expect(fetchSpy).toHaveBeenCalledWith('/api/chats/c1/stream?after=0', expect.anything())
  })

  it('does not replay a run the live stream just finished while the poll still says running', async () => {
    chat.real = true
    const chunks = [
      { type: 'start', messageId: 'a1' },
      { type: 'data-stage', id: 'stage:ontology', data: { stage: 'ontology', status: 'running' } },
      { type: 'data-stage', id: 'stage:ontology', data: { stage: 'ontology', status: 'failed', message: 'Boom' } },
      { type: 'error', errorText: 'Boom' },
      { type: 'finish' },
    ]
    fetchSpy.mockImplementation(async (url: string) =>
      url === '/api/chats/c1/messages'
        ? new Response(`${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('')}data: [DONE]\n\n`, {
            headers: { 'content-type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' },
          })
        : new Response(null, { status: 204 }),
    )
    const { container } = renderChat()
    runState.current = { status: 'running', stage: 'ontology', runId: 'r1', assistantMessageId: 'a1' }
    fireEvent.click(screen.getByRole('button', { name: 'Send run' }))
    await waitFor(() => expect(container.querySelector('[data-part="console"]')).toBeTruthy())
    await act(async () => {})
    const streams = fetchSpy.mock.calls.map(([url]) => String(url)).filter((url) => url.includes('/stream'))
    expect(streams).toEqual(['/api/chats/c1/stream'])
    expect(container.querySelectorAll('[data-part="console"]')).toHaveLength(1)
  })

  it('shows only the failed console, no notice, when a replayed run ends in error', async () => {
    chat.real = true
    runState.current = { status: 'failed', stage: 'graph_build', runId: 'r1', assistantMessageId: 'a1' }
    const chunks = [
      { type: 'start', messageId: 'a1' },
      { type: 'data-stage', id: 'stage:graph_build', data: { stage: 'graph_build', status: 'running' } },
      {
        type: 'data-stage',
        id: 'stage:graph_build',
        data: { stage: 'graph_build', status: 'failed', message: 'Injected failure' },
      },
      { type: 'error', errorText: 'Injected failure' },
      { type: 'finish' },
    ]
    fetchSpy.mockImplementation(
      async () =>
        new Response(`${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('')}data: [DONE]\n\n`, {
          headers: { 'content-type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' },
        }),
    )
    const { container } = render(
      <Chat
        chatId="c1"
        initialMessages={[{ id: 'u0', role: 'user', parts: [{ type: 'text', text: 'How will people react?' }] }]}
        activeRun={{ id: 'r1', assistantMessageId: 'a1', stage: 'graph_build' }}
        latestRun={null}
        limits={limits}
      />,
    )
    await waitFor(() => expect(container.querySelector('[data-part="console"]')).toBeTruthy())
    await act(async () => {})
    expect(screen.queryByText('Something went wrong sending your message')).toBeNull()
  })

  it("does not call a stage's failure message a send failure", async () => {
    chat.messages = [
      {
        id: 'a1',
        role: 'assistant',
        parts: [{ type: 'data-stage', data: { stage: 'ontology', status: 'failed', message: 'Injected failure' } }],
      },
    ]
    renderChat()
    await act(async () => chat.options!.onError(new Error('Injected failure')))
    expect(screen.queryByText('Something went wrong sending your message')).toBeNull()
    await act(async () => chat.options!.onError(new Error('Failed to fetch')))
    expect(screen.getAllByText('Something went wrong sending your message').length).toBeGreaterThan(0)
  })

  it('keeps the send-failed notice when a new run fails to post after a failed run', async () => {
    runState.current = { status: 'failed', stage: 'ontology', runId: 'r1', assistantMessageId: 'a1' }
    renderChat()
    await act(async () => chat.options!.onError(new Error('Injected failure')))
    expect(screen.queryByText('Something went wrong sending your message')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Send run' }))
    await act(async () => chat.options!.onError(new Error('Internal Server Error')))
    expect(screen.getAllByText('Something went wrong sending your message').length).toBeGreaterThan(0)
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
    expect(within(assistant).getByText(`${question.slice(0, 60).trimEnd()}…`)).toBeTruthy()
    expect(container.querySelector('[data-slot="message-scroller-button"]')).not.toBeNull()
  })

  it('docks the composer under a scrolling thread', () => {
    renderChat()
    const thread = screen.getByRole('region', { name: 'Messages' })
    const composerControl = screen.getByRole('button', { name: 'Send follow-up' })
    expect(thread.contains(composerControl)).toBe(false)
    expect(thread.compareDocumentPosition(composerControl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
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
      expect(composer.props).toMatchObject({ mode: 'interview', selectionEnabled: true, disabled: false, busy: false })
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
      expect(composer.props).toMatchObject({ mode: 'run', selectionEnabled: false, disabled: true, busy: true })
    })

    it('posts the question as plain JSON, then reattaches once when the stream is closed, never through sendMessage', async () => {
      chat.status = 'ready'
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

    it('relies on the live tail and does not reattach when the stream is already open', async () => {
      chat.status = 'streaming'
      fetchSpy.mockResolvedValue(Response.json({ questionId: 'q1', interviewIds: ['i1', 'i2'] }, { status: 202 }))
      renderChat()
      fireEvent.click(screen.getByRole('button', { name: 'Send interview' }))
      expect(await composer.sent).toBe('sent')
      expect(fetchSpy).toHaveBeenCalledTimes(1)
      expect(chat.resumeStream).not.toHaveBeenCalled()
    })

    it('reads the stream status when the post returns, not when it was sent', async () => {
      chat.status = 'ready'
      let respond!: (response: Response) => void
      fetchSpy.mockReturnValue(new Promise<Response>((resolve) => (respond = resolve)))
      const view = renderChat()
      fireEvent.click(screen.getByRole('button', { name: 'Send interview' }))
      chat.status = 'streaming'
      view.rerender(<Chat chatId="c1" initialMessages={[]} activeRun={null} latestRun={null} limits={limits} />)
      const before = chat.resumeStream.mock.calls.length
      respond(Response.json({ questionId: 'q1', interviewIds: ['i1'] }, { status: 202 }))
      expect(await composer.sent).toBe('sent')
      expect(chat.resumeStream).toHaveBeenCalledTimes(before)
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

  it.each([
    [true, "You've used today's free run. Sign in for 3 runs a day, or come back tomorrow."],
    [false, "You've used today's run. Come back tomorrow."],
  ])('words the anonymous quota notice by sign-in availability (%s)', async (available, sentence) => {
    const anonymous = { ...limits, anonymous: true, maxRunsPerDay: 1, demoMode: true }
    render(
      <Chat
        chatId="c1"
        initialMessages={[]}
        activeRun={null}
        latestRun={null}
        limits={anonymous}
        {...(available ? { signIn: { max: 3 } } : {})}
      />,
    )
    act(() => chat.options!.onError(new Error('quota_exceeded')))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe(sentence))
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

  it('reports the running state and the live step to the header, and clears it on unmount', () => {
    seen.length = 0
    runState.current = { status: 'running', stage: 'graph_build', assistantMessageId: 'm1' }
    chat.messages = [
      {
        id: 'm1',
        role: 'assistant',
        parts: [
          { type: 'data-stage', id: 'stage:ontology', data: { stage: 'ontology', status: 'done' } },
          { type: 'data-stage', id: 'stage:graph_build', data: { stage: 'graph_build', status: 'running' } },
        ],
      },
    ]
    const { rerender } = render(<Harness open />)
    expect(seen.at(-1)).toEqual({ chatId: 'c1', running: true, step: 'Building the knowledge graph' })
    rerender(<Harness open={false} />)
    expect(seen.at(-1)).toBeNull()
  })

  it("leaves another chat's activity alone on unmount", () => {
    seen.length = 0
    const { rerender } = render(<OtherHarness open />)
    fireEvent.click(screen.getByRole('button', { name: 'Other chat' }))
    rerender(<OtherHarness open={false} />)
    expect(seen.at(-1)).toEqual({ chatId: 'c2', running: true })
  })

  it('reports an idle chat as not running', () => {
    seen.length = 0
    render(<Harness open />)
    expect(seen.at(-1)).toEqual({ chatId: 'c1', running: false })
  })

  describe('a prompt-only run', () => {
    const card = () => screen.queryByTestId('context-card')
    const runOptions = { maxRounds: 1, pauseForInterviews: false }

    it('asks for context first and sends nothing', async () => {
      renderChat()
      fireEvent.click(screen.getByRole('button', { name: 'Send prompt-only run' }))
      expect(await composer.sent).toBe('sent')
      expect(screen.getByRole('group', { name: 'You: why?' })).toBeTruthy()
      expect(card()).toBeTruthy()
      expect(screen.getByText('Needs you')).toBeTruthy()
      await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Add context or start the run'))
      expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Background and constraints' }))
      expect(chat.sendMessage).not.toHaveBeenCalled()
      expect(upsertChat).not.toHaveBeenCalled()
      expect(runOpts.current).toMatchObject({ enabled: false, sendCount: 0 })
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('starts with the filled fields as the seed', async () => {
      renderChat()
      fireEvent.click(screen.getByRole('button', { name: 'Send prompt-only run' }))
      fireEvent.change(await screen.findByRole('textbox', { name: 'Who should be simulated' }), {
        target: { value: '  Pro customers ' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Start run' }))
      expect(chat.sendMessage).toHaveBeenCalledTimes(1)
      expect(chat.sendMessage).toHaveBeenCalledWith(
        { text: 'why?' },
        { body: { uploadIds: [], runOptions, seed: { actors: 'Pro customers' } } },
      )
      expect(card()).toBeNull()
      expect(upsertChat).toHaveBeenCalledWith({ id: 'c1', runStatus: 'queued', title: 'why?' })
      expect(runOpts.current).toMatchObject({ enabled: true, sendCount: 1 })
    })

    it('skips without a seed', async () => {
      renderChat()
      fireEvent.click(screen.getByRole('button', { name: 'Send prompt-only run' }))
      fireEvent.change(await screen.findByRole('textbox', { name: 'What is changing' }), {
        target: { value: 'A new fee' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Skip and run with my question' }))
      expect(chat.sendMessage).toHaveBeenCalledTimes(1)
      expect(chat.sendMessage).toHaveBeenCalledWith({ text: 'why?' }, { body: { uploadIds: [], runOptions } })
      expect(card()).toBeNull()
    })

    it('sends an empty Start without a seed', async () => {
      renderChat()
      fireEvent.click(screen.getByRole('button', { name: 'Send prompt-only run' }))
      fireEvent.click(await screen.findByRole('button', { name: 'Start run' }))
      expect(chat.sendMessage).toHaveBeenCalledWith({ text: 'why?' }, { body: { uploadIds: [], runOptions } })
    })

    it('sends a 40-word prompt at once', async () => {
      renderChat()
      fireEvent.click(screen.getByRole('button', { name: 'Send long prompt-only run' }))
      await waitFor(() =>
        expect(chat.sendMessage).toHaveBeenCalledWith({ text: LONG_PROMPT }, { body: { uploadIds: [], runOptions } }),
      )
      expect(card()).toBeNull()
    })

    it('sends a short prompt with a file at once', async () => {
      renderChat()
      fireEvent.click(screen.getByRole('button', { name: 'Send short run with a file' }))
      await waitFor(() =>
        expect(chat.sendMessage).toHaveBeenCalledWith({ text: 'short' }, { body: { uploadIds: ['u1'], runOptions } }),
      )
      expect(card()).toBeNull()
    })

    it('replaces the pending question on a second send', async () => {
      renderChat()
      fireEvent.click(screen.getByRole('button', { name: 'Send prompt-only run' }))
      await screen.findByTestId('context-card')
      fireEvent.click(screen.getByRole('button', { name: 'Send another prompt-only run' }))
      await waitFor(() => expect(screen.getByRole('group', { name: 'You: and if prices fall?' })).toBeTruthy())
      expect(screen.queryByRole('group', { name: 'You: why?' })).toBeNull()
      expect(screen.getAllByTestId('context-card')).toHaveLength(1)
      fireEvent.click(screen.getByRole('button', { name: 'Skip and run with my question' }))
      expect(chat.sendMessage).toHaveBeenCalledTimes(1)
      expect(chat.sendMessage).toHaveBeenCalledWith(
        { text: 'and if prices fall?' },
        { body: { uploadIds: [], runOptions } },
      )
    })

    it('drops the card when a long prompt is sent instead', async () => {
      renderChat()
      fireEvent.click(screen.getByRole('button', { name: 'Send prompt-only run' }))
      await screen.findByTestId('context-card')
      fireEvent.click(screen.getByRole('button', { name: 'Send long prompt-only run' }))
      await waitFor(() => expect(card()).toBeNull())
      expect(chat.sendMessage).toHaveBeenCalledTimes(1)
      expect(screen.queryByRole('group', { name: 'You: why?' })).toBeNull()
    })

    it('has no axe violations with the card', async () => {
      const { container } = renderChat()
      fireEvent.click(screen.getByRole('button', { name: 'Send prompt-only run' }))
      await screen.findByTestId('context-card')
      expect(await axe(container)).toHaveNoViolations()
    })
  })

  it('has no axe violations', async () => {
    const { container } = renderChat(doneRun('open', inMinutes(10)))
    await act(async () => chat.options!.onError(new Error(JSON.stringify({ error: 'follow_up_failed' }))))
    expect(await axe(container)).toHaveNoViolations()
  })
})

describe('Chat in new mode', () => {
  const STARTER = 'How will customers react to a 20% price increase on our Pro plan?'
  const SSE = { 'content-type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' }
  const usage = { used: 0, max: 2, resetAt: null }
  const renderNew = () =>
    render(
      <Chat
        mode="new"
        chatId="n1"
        initialMessages={[]}
        activeRun={null}
        latestRun={null}
        recent={[{ id: 'old', title: 'Price increase', updatedAt: new Date().toISOString() }]}
        limits={{ ...limits, demoMode: true }}
        usage={usage}
      />,
    )
  const posts = () =>
    fetchSpy.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST').map(([url]) => url)

  it('renders the welcome block and fills the composer from a starter', () => {
    renderNew()
    expect(screen.getByRole('heading', { name: 'Xenet Opinions' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Price increase/ }).getAttribute('href')).toBe('/c/old')
    fireEvent.click(screen.getByRole('button', { name: STARTER }))
    expect(composer.props?.value).toBe(STARTER)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('sends in place with the client id, then swaps the URL once', async () => {
    chat.real = true
    const pushState = vi.spyOn(window.history, 'pushState').mockImplementation(() => {})
    let respond: (response: Response) => void = () => {}
    fetchSpy.mockImplementation((url: string) =>
      url === '/api/chats/n1/messages'
        ? new Promise<Response>((resolve) => {
            respond = resolve
          })
        : Promise.resolve(Response.json({ status: 'queued' })),
    )
    renderNew()
    fireEvent.click(screen.getByRole('button', { name: 'Send run' }))
    await waitFor(() => expect(screen.getByText('why?')).toBeTruthy())
    expect(screen.queryByRole('heading', { name: 'Xenet Opinions' })).toBeNull()
    expect(pushState).not.toHaveBeenCalled()
    expect(upsertChat).not.toHaveBeenCalled()
    const chunks = [
      { type: 'start', messageId: 'a1' },
      { type: 'data-stage', id: 'stage:ontology', data: { stage: 'ontology', status: 'running' } },
    ]
    respond(new Response(chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join(''), { headers: SSE }))
    await waitFor(() => expect(pushState).toHaveBeenCalledWith(null, '', '/c/n1'))
    await act(async () => {})
    expect(pushState).toHaveBeenCalledTimes(1)
    expect(upsertChat).toHaveBeenCalledWith({ id: 'n1', title: 'why?', runStatus: 'queued' })
    expect(composer.props?.usage).toMatchObject({ used: 1 })
    expect(posts()).toEqual(['/api/chats/n1/messages'])
    const init = fetchSpy.mock.calls.find(([url]) => url === '/api/chats/n1/messages')?.[1] as RequestInit
    expect(JSON.parse(String(init.body))).toMatchObject({
      id: 'n1',
      message: { role: 'user', parts: [{ type: 'text', text: 'why?' }] },
      uploadIds: ['u1'],
      runOptions: { maxRounds: 1, pauseForInterviews: false },
    })
    expect(await composer.sent).toBe('sent')
    pushState.mockRestore()
  })

  it('adopts fresh usage from the server', () => {
    const view = renderNew()
    expect(composer.props?.usage).toMatchObject({ used: 0 })
    view.rerender(
      <Chat
        mode="new"
        chatId="n1"
        initialMessages={[]}
        activeRun={null}
        latestRun={null}
        limits={{ ...limits, demoMode: true }}
        usage={{ used: 2, max: 2, resetAt: null }}
      />,
    )
    expect(composer.props?.usage).toMatchObject({ used: 2 })
  })

  it('drops an aborted first send without claiming the URL or showing a notice', async () => {
    chat.real = true
    const pushState = vi.spyOn(window.history, 'pushState').mockImplementation(() => {})
    fetchSpy.mockImplementation((url: string, init?: RequestInit) =>
      url === '/api/chats/n1/run/cancel'
        ? Promise.resolve(Response.json({ error: 'not_found' }, { status: 404 }))
        : new Promise<Response>((_, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
          }),
    )
    renderNew()
    fireEvent.click(screen.getByRole('button', { name: 'Send run' }))
    await waitFor(() => expect(screen.getByText('why?')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(await composer.sent).toBe('aborted')
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Xenet Opinions' })).toBeTruthy())
    expect(pushState).not.toHaveBeenCalled()
    expect(upsertChat).not.toHaveBeenCalled()
    expect(composer.props?.usage).toMatchObject({ used: 0 })
    await act(async () => {})
    expect(screen.queryAllByRole('status').filter((el) => el.textContent)).toEqual([])
    expect(posts()).toEqual(['/api/chats/n1/messages', '/api/chats/n1/run/cancel'])
    pushState.mockRestore()
  })

  it('stays on the welcome block with the notice when the send is refused, and retries with the same id', async () => {
    chat.real = true
    const pushState = vi.spyOn(window.history, 'pushState').mockImplementation(() => {})
    fetchSpy.mockResolvedValueOnce(Response.json({ error: 'quota_exceeded' }, { status: 429 }))
    renderNew()
    fireEvent.click(screen.getByRole('button', { name: 'Send run' }))
    expect(await composer.sent).not.toBe('sent')
    await waitFor(() =>
      expect(screen.getAllByText("You've used today's two runs. Come back tomorrow.").length).toBeGreaterThan(0),
    )
    expect(screen.getByRole('heading', { name: 'Xenet Opinions' })).toBeTruthy()
    expect(pushState).not.toHaveBeenCalled()
    expect(upsertChat).not.toHaveBeenCalled()
    expect(composer.props?.usage).toMatchObject({ used: 0 })
    fetchSpy.mockImplementation(async (url: string) =>
      url === '/api/chats/n1/messages'
        ? new Response(`data: ${JSON.stringify({ type: 'start', messageId: 'a1' })}\n\n`, { headers: SSE })
        : Response.json({ status: 'queued' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Send run' }))
    await waitFor(() => expect(pushState).toHaveBeenCalledWith(null, '', '/c/n1'))
    expect(posts()).toEqual(['/api/chats/n1/messages', '/api/chats/n1/messages'])
    pushState.mockRestore()
  })
  it('holds a prompt-only run behind the card, then swaps the URL only once the run is accepted', async () => {
    chat.real = true
    const pushState = vi.spyOn(window.history, 'pushState').mockImplementation(() => {})
    let respond: (response: Response) => void = () => {}
    fetchSpy.mockImplementation((url: string) =>
      url === '/api/chats/n1/messages'
        ? new Promise<Response>((resolve) => {
            respond = resolve
          })
        : Promise.resolve(Response.json({ status: 'queued' })),
    )
    renderNew()
    fireEvent.click(screen.getByRole('button', { name: 'Send prompt-only run' }))
    expect(await composer.sent).toBe('sent')
    expect(screen.queryByRole('heading', { name: 'Xenet Opinions' })).toBeNull()
    expect(screen.getByRole('group', { name: 'You: why?' })).toBeTruthy()
    expect(fetchSpy).not.toHaveBeenCalled()
    fireEvent.change(screen.getByRole('textbox', { name: 'Background and constraints' }), {
      target: { value: 'We raised prices last year' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Start run' }))
    await waitFor(() => expect(posts()).toEqual(['/api/chats/n1/messages']))
    expect(screen.queryByTestId('context-card')).toBeNull()
    expect(pushState).not.toHaveBeenCalled()
    expect(upsertChat).not.toHaveBeenCalled()
    respond(new Response(`data: ${JSON.stringify({ type: 'start', messageId: 'a1' })}\n\n`, { headers: SSE }))
    await waitFor(() => expect(pushState).toHaveBeenCalledWith(null, '', '/c/n1'))
    expect(upsertChat).toHaveBeenCalledWith({ id: 'n1', title: 'why?', runStatus: 'queued' })
    expect(composer.props?.usage).toMatchObject({ used: 1 })
    const init = fetchSpy.mock.calls.find(([url]) => url === '/api/chats/n1/messages')?.[1] as RequestInit
    expect(JSON.parse(String(init.body))).toMatchObject({
      uploadIds: [],
      runOptions: { maxRounds: 1, pauseForInterviews: false },
      seed: { background: 'We raised prices last year' },
    })
    pushState.mockRestore()
  })

  it('brings the card back when the prompt-only run is refused', async () => {
    chat.real = true
    const pushState = vi.spyOn(window.history, 'pushState').mockImplementation(() => {})
    fetchSpy.mockResolvedValueOnce(Response.json({ error: 'quota_exceeded' }, { status: 429 }))
    renderNew()
    fireEvent.click(screen.getByRole('button', { name: 'Send prompt-only run' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Skip and run with my question' }))
    await waitFor(() =>
      expect(screen.getAllByText("You've used today's two runs. Come back tomorrow.").length).toBeGreaterThan(0),
    )
    await waitFor(() => expect(screen.getByTestId('context-card')).toBeTruthy())
    expect(screen.getAllByRole('group', { name: 'You: why?' })).toHaveLength(1)
    expect(pushState).not.toHaveBeenCalled()
    expect(upsertChat).not.toHaveBeenCalled()
    pushState.mockRestore()
  })
  it('keeps the welcome block away between Start and the first message', async () => {
    chat.sendMessage.mockImplementation(() => new Promise(() => {}))
    renderNew()
    fireEvent.click(screen.getByRole('button', { name: 'Send prompt-only run' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Start run' }))
    expect(chat.sendMessage).toHaveBeenCalledTimes(1)
    await act(async () => {})
    expect(screen.queryByTestId('context-card')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Xenet Opinions' })).toBeNull()
  })

  it('puts the question back in the composer when the first send from the card is stopped', async () => {
    chat.real = true
    const pushState = vi.spyOn(window.history, 'pushState').mockImplementation(() => {})
    fetchSpy.mockImplementation((url: string, init?: RequestInit) =>
      url === '/api/chats/n1/run/cancel'
        ? Promise.resolve(Response.json({ error: 'not_found' }, { status: 404 }))
        : new Promise<Response>((_, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
          }),
    )
    renderNew()
    fireEvent.click(screen.getByRole('button', { name: 'Send prompt-only run' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Start run' }))
    await waitFor(() => expect(screen.queryByTestId('context-card')).toBeNull())
    await waitFor(() => expect(screen.getByRole('group', { name: 'You: why?' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    await waitFor(() => expect(composer.props?.value).toBe('why?'))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Xenet Opinions' })).toBeTruthy())
    expect(screen.queryByTestId('context-card')).toBeNull()
    expect(pushState).not.toHaveBeenCalled()
    pushState.mockRestore()
  })
})
