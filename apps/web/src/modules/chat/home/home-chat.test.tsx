// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { Limits } from '@/server/limits'
import { axe } from '@/test/axe'

const router = { push: vi.fn(), refresh: vi.fn() }
const location = vi.hoisted(() => ({ pathname: '/' }))
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => location.pathname }))

import { ChatListProvider, useChatList } from '@/modules/chat/chat-list-context'
import { UsageProvider } from '../shell/usage-context'
import { HomeChat } from './home-chat'

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  router.push.mockReset()
  router.refresh.mockReset()
  location.pathname = '/'
})

const LIMITS: Limits = {
  demoMode: true,
  paused: false,
  maxRunsPerDay: 2,
  signedInMaxRunsPerDay: 3,
  anonymous: false,
  maxRounds: 3,
  allowPause: true,
}

function Titles() {
  const { chats } = useChatList()
  return <output data-testid="titles">{chats.map((c) => `${c.id}:${c.title}:${c.runStatus}`).join(',')}</output>
}

function renderHome(limits: Partial<Limits> = {}, signIn?: { max: number }) {
  return render(homeTree(limits, signIn))
}

function homeTree(limits: Partial<Limits> = {}, signIn?: { max: number }) {
  return (
    <TooltipProvider>
      <ChatListProvider chats={[]}>
        <Titles />
        <UsageProvider usage={null} {...(signIn ? { signIn } : {})}>
          <HomeChat limits={{ ...LIMITS, ...limits }} />
        </UsageProvider>
      </ChatListProvider>
    </TooltipProvider>
  )
}

type Handler = (url: string, init?: RequestInit) => Response
function stubFetch(handlers: Record<string, Handler>) {
  const calls: string[] = []
  const fetchStub = vi.fn(async (url: string, init?: RequestInit) => {
    const route = url.replace(/^\/api\/chats\/[^/]+\//, '/api/chats/:id/')
    if (route === '/api/chats/:id/run') return Response.json({ status: 'queued' })
    calls.push(`${init?.method ?? 'GET'} ${route}`)
    const handler = handlers[route]
    if (!handler) throw new Error(`unexpected ${url}`)
    return handler(url, init)
  })
  vi.stubGlobal('fetch', fetchStub)
  return { calls, fetchStub }
}

const STREAM = () =>
  new Response(
    new ReadableStream({
      start: (controller) =>
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'start', messageId: 'a1' })}\n\n`)),
    }),
    { headers: { 'content-type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' } },
  )
const spyPushState = () => vi.spyOn(window.history, 'pushState').mockImplementation(() => {})
const uploadChatId = (fetchStub: ReturnType<typeof stubFetch>['fetchStub']) =>
  (fetchStub.mock.calls.find(([url]) => url === '/api/uploads')![1]!.body as FormData).get('chatId')

const textarea = () => screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement
const UPLOAD = { '/api/uploads': () => Response.json({ uploads: [{ id: 'u1' }] }, { status: 201 }) }
const attach = () =>
  fireEvent.change(screen.getByTestId('file-input'), {
    target: { files: [new File(['x'], 'brief.txt', { type: 'text/plain' })] },
  })
const STARTER = 'How will customers react to a 20% price increase on our Pro plan?'

describe('HomeChat', () => {
  it('fills the composer from a starter without a network call', () => {
    const { calls } = stubFetch({})
    renderHome()
    fireEvent.click(screen.getByRole('button', { name: STARTER }))
    expect(textarea().value).toBe(STARTER)
    expect(document.activeElement).toBe(textarea())
    expect(calls).toEqual([])
  })

  it('sends in place with a browser id and swaps the URL, without creating the chat first', async () => {
    const pushState = spyPushState()
    const { calls, fetchStub } = stubFetch({ ...UPLOAD, '/api/chats/:id/messages': STREAM })
    renderHome()
    fireEvent.click(screen.getByRole('button', { name: STARTER }))
    attach()
    fireEvent.keyDown(textarea(), { key: 'Enter' })
    await waitFor(() => expect(pushState).toHaveBeenCalledTimes(1))
    const id = String(uploadChatId(fetchStub))
    expect(pushState).toHaveBeenCalledWith(null, '', `/c/${id}`)
    expect(router.push).not.toHaveBeenCalled()
    expect(router.refresh).not.toHaveBeenCalled()
    expect(calls).toEqual(['POST /api/uploads', 'POST /api/chats/:id/messages'])
    const [url, init] = fetchStub.mock.calls.find(([url]) => url.endsWith('/messages'))!
    expect(url).toBe(`/api/chats/${id}/messages`)
    const body = JSON.parse(String(init?.body))
    expect(body).toMatchObject({
      id,
      message: { role: 'user', parts: [{ type: 'text', text: STARTER }] },
      uploadIds: ['u1'],
      runOptions: { maxRounds: 3, pauseForInterviews: false },
    })
    expect(typeof body.message.id).toBe('string')
    expect(screen.getByTestId('titles').textContent).toBe(`${id}:${STARTER.slice(0, 60)}:queued`)
    expect(screen.queryByRole('heading', { name: 'Xenet Opinions' })).toBeNull()
  })

  it('shows a fresh home on Back and asks the server for the thread on Forward', async () => {
    const pushState = spyPushState()
    const { fetchStub } = stubFetch({ ...UPLOAD, '/api/chats/:id/messages': STREAM })
    const view = renderHome()
    attach()
    fireEvent.change(textarea(), { target: { value: 'hello' } })
    fireEvent.keyDown(textarea(), { key: 'Enter' })
    await waitFor(() => expect(pushState).toHaveBeenCalledTimes(1))
    const id = String(uploadChatId(fetchStub))
    location.pathname = `/c/${id}`
    view.rerender(homeTree())
    expect(screen.getByText('hello')).toBeTruthy()
    expect(router.refresh).not.toHaveBeenCalled()
    location.pathname = '/'
    view.rerender(homeTree())
    expect(screen.getByRole('heading', { name: 'Xenet Opinions' })).toBeTruthy()
    expect(screen.queryByText('hello')).toBeNull()
    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1))
    view.rerender(homeTree())
    await act(async () => {})
    expect(router.refresh).toHaveBeenCalledTimes(1)
    location.pathname = `/c/${id}`
    view.rerender(homeTree())
    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('heading', { name: 'Xenet Opinions' })).toBeNull()
    expect(screen.queryByRole('textbox', { name: 'Message' })).toBeNull()
  })

  it('makes no network call when a file is attached', async () => {
    const { calls } = stubFetch({})
    renderHome()
    attach()
    await act(async () => {})
    expect(calls).toEqual([])
  })

  it.each([
    [429, 'quota_exceeded', "You've used today's two runs. Come back tomorrow."],
    [400, 'rounds_exceeded', 'The demo allows up to 3 rounds.'],
    [409, 'demo_paused', 'The demo is paused right now. Try again later.'],
    [409, 'run_active', 'A run is already in progress for this chat.'],
  ])('stays home with the notice and the attached file on a %s %s', async (status, error, notice) => {
    const pushState = spyPushState()
    stubFetch({
      '/api/uploads': () => Response.json({ uploads: [{ id: 'u1' }] }, { status: 201 }),
      '/api/chats/:id/messages': () => Response.json({ error }, { status }),
    })
    renderHome()
    fireEvent.change(screen.getByTestId('file-input'), {
      target: { files: [new File(['x'], 'brief.txt', { type: 'text/plain' })] },
    })
    fireEvent.change(textarea(), { target: { value: 'hello' } })
    fireEvent.keyDown(textarea(), { key: 'Enter' })
    await waitFor(() => expect(screen.getAllByText(notice).length).toBeGreaterThan(0))
    expect(pushState).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Xenet Opinions' })).toBeTruthy()
    expect(textarea().value).toBe('hello')
    expect(screen.getByTestId('pending-file').textContent).toContain('brief.txt')
    expect(screen.getByTestId('titles').textContent).toBe('')
  })

  it.each([
    [true, "You've used today's free run. Sign in for 3 runs a day, or come back tomorrow."],
    [false, "You've used today's run. Come back tomorrow."],
  ])('words the anonymous quota notice by sign-in availability (%s)', async (available, notice) => {
    stubFetch({
      ...UPLOAD,
      '/api/chats/:id/messages': () => Response.json({ error: 'quota_exceeded' }, { status: 429 }),
    })
    renderHome({ anonymous: true, maxRunsPerDay: 1, demoMode: true }, available ? { max: 3 } : undefined)
    attach()
    fireEvent.change(textarea(), { target: { value: 'hello' } })
    fireEvent.keyDown(textarea(), { key: 'Enter' })
    await waitFor(() => expect(screen.getAllByText(notice).length).toBeGreaterThan(0))
  })

  it('reuses the browser id when a send is retried', async () => {
    const pushState = spyPushState()
    let first = true
    const { calls, fetchStub } = stubFetch({
      ...UPLOAD,
      '/api/chats/:id/messages': () => {
        const response = first ? Response.json({ error: 'run_active' }, { status: 409 }) : STREAM()
        first = false
        return response
      },
    })
    renderHome()
    attach()
    fireEvent.change(textarea(), { target: { value: 'hello' } })
    fireEvent.keyDown(textarea(), { key: 'Enter' })
    await waitFor(() => expect(calls).toHaveLength(2))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Send message' }).hasAttribute('disabled')).toBe(false),
    )
    fireEvent.keyDown(textarea(), { key: 'Enter' })
    await waitFor(() => expect(pushState).toHaveBeenCalledTimes(1))
    const urls = fetchStub.mock.calls.map(([url]) => url).filter((url) => url.endsWith('/messages'))
    expect(urls).toHaveLength(2)
    expect(urls[1]).toBe(urls[0])
    expect(urls[0]).toBe(`/api/chats/${uploadChatId(fetchStub)}/messages`)
    expect(calls).not.toContain('POST /api/chats')
  })

  it('disables the composer while the demo is paused', () => {
    stubFetch({})
    renderHome({ paused: true })
    expect(textarea().disabled).toBe(true)
    expect(screen.getAllByText('The demo is paused').length).toBeGreaterThan(0)
  })

  it('lists no recent chats and has no axe violations', async () => {
    stubFetch({})
    const { container } = renderHome()
    expect(screen.queryByRole('heading', { name: 'Recent chats' })).toBeNull()
    expect(await axe(container)).toHaveNoViolations()
  })
})
