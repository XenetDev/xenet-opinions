// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { Limits } from '@/server/limits'
import { axe } from '@/test/axe'

const router = { push: vi.fn(), refresh: vi.fn() }
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/' }))

import { ChatListProvider, useChatList } from '@/modules/sidebar/chat-list-context'
import { HomeChat } from './home-chat'

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  router.push.mockReset()
  router.refresh.mockReset()
})

const LIMITS: Limits = { demoMode: true, paused: false, maxRunsPerDay: 2, maxRounds: 3, allowPause: true }

function Titles() {
  const { chats } = useChatList()
  return <output data-testid="titles">{chats.map((c) => `${c.id}:${c.title}:${c.runStatus}`).join(',')}</output>
}

function renderHome(limits: Partial<Limits> = {}) {
  return render(
    <TooltipProvider>
      <ChatListProvider chats={[]}>
        <Titles />
        <HomeChat
          recent={[{ id: 'old', title: 'Price increase', updatedAt: new Date().toISOString() }]}
          limits={{ ...LIMITS, ...limits }}
        />
      </ChatListProvider>
    </TooltipProvider>,
  )
}

type Handler = (url: string, init?: RequestInit) => Response
function stubFetch(handlers: Record<string, Handler>) {
  const calls: string[] = []
  const fetchStub = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${url}`)
    const handler = handlers[url]
    if (!handler) throw new Error(`unexpected ${url}`)
    return handler(url, init)
  })
  vi.stubGlobal('fetch', fetchStub)
  return { calls, fetchStub }
}

const textarea = () => screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement
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

  it('creates the chat, posts the run and navigates on send', async () => {
    const cancel = vi.fn()
    const { calls, fetchStub } = stubFetch({
      '/api/chats': () => Response.json({ id: 'new' }, { status: 201 }),
      '/api/chats/new/messages': () => new Response(new ReadableStream({ cancel }), { status: 200 }),
    })
    renderHome()
    fireEvent.click(screen.getByRole('button', { name: STARTER }))
    fireEvent.keyDown(textarea(), { key: 'Enter' })
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/c/new'))
    expect(router.refresh).toHaveBeenCalled()
    expect(calls).toEqual(['POST /api/chats', 'POST /api/chats/new/messages'])
    const body = JSON.parse(String(fetchStub.mock.calls[1]?.[1]?.body))
    expect(body).toMatchObject({
      id: 'new',
      message: { role: 'user', parts: [{ type: 'text', text: STARTER }] },
      uploadIds: [],
      runOptions: { maxRounds: 3, pauseForInterviews: false },
    })
    expect(typeof body.message.id).toBe('string')
    expect(screen.getByTestId('titles').textContent).toBe(`new:${STARTER.slice(0, 60)}:queued`)
    expect(cancel).toHaveBeenCalled()
  })

  it('creates the chat when a file is attached, before uploading it', async () => {
    const { calls } = stubFetch({
      '/api/chats': () => Response.json({ id: 'new' }, { status: 201 }),
      '/api/uploads': () => Response.json({ uploads: [{ id: 'u1' }] }, { status: 201 }),
      '/api/chats/new/messages': () => new Response('stream', { status: 200 }),
    })
    renderHome()
    fireEvent.change(screen.getByTestId('file-input'), {
      target: { files: [new File(['x'], 'brief.txt', { type: 'text/plain' })] },
    })
    await waitFor(() => expect(calls).toEqual(['POST /api/chats']))
    fireEvent.change(textarea(), { target: { value: 'hello' } })
    fireEvent.keyDown(textarea(), { key: 'Enter' })
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/c/new'))
    expect(calls).toEqual(['POST /api/chats', 'POST /api/uploads', 'POST /api/chats/new/messages'])
  })

  it.each([
    [429, 'quota_exceeded', "You've used today's two runs. Come back tomorrow."],
    [400, 'rounds_exceeded', 'The demo allows up to 3 rounds.'],
    [409, 'demo_paused', 'The demo is paused right now. Try again later.'],
    [409, 'run_active', 'A run is already in progress for this chat.'],
  ])('stays home with the notice and the attached file on a %s %s', async (status, error, notice) => {
    stubFetch({
      '/api/chats': () => Response.json({ id: 'new' }, { status: 201 }),
      '/api/uploads': () => Response.json({ uploads: [{ id: 'u1' }] }, { status: 201 }),
      '/api/chats/new/messages': () => Response.json({ error }, { status }),
    })
    renderHome()
    fireEvent.change(screen.getByTestId('file-input'), {
      target: { files: [new File(['x'], 'brief.txt', { type: 'text/plain' })] },
    })
    fireEvent.change(textarea(), { target: { value: 'hello' } })
    fireEvent.keyDown(textarea(), { key: 'Enter' })
    await waitFor(() => expect(screen.getAllByText(notice).length).toBeGreaterThan(0))
    expect(router.push).not.toHaveBeenCalled()
    expect(textarea().value).toBe('hello')
    expect(screen.getByTestId('pending-file').textContent).toContain('brief.txt')
    expect(screen.getByTestId('titles').textContent).toBe('')
  })

  it('reuses the created chat when a send is retried', async () => {
    let first = true
    const { calls } = stubFetch({
      '/api/chats': () => Response.json({ id: 'new' }, { status: 201 }),
      '/api/chats/new/messages': () => {
        const response = first ? Response.json({ error: 'run_active' }, { status: 409 }) : new Response('ok')
        first = false
        return response
      },
    })
    renderHome()
    fireEvent.change(textarea(), { target: { value: 'hello' } })
    fireEvent.keyDown(textarea(), { key: 'Enter' })
    await waitFor(() => expect(calls).toHaveLength(2))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Send message' }).hasAttribute('disabled')).toBe(false),
    )
    fireEvent.keyDown(textarea(), { key: 'Enter' })
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/c/new'))
    expect(calls.filter((call) => call === 'POST /api/chats')).toHaveLength(1)
  })

  it('disables the composer while the demo is paused', () => {
    stubFetch({})
    renderHome({ paused: true })
    expect(textarea().disabled).toBe(true)
    expect(screen.getAllByText('The demo is paused').length).toBeGreaterThan(0)
  })

  it('links resume rows and has no axe violations', async () => {
    stubFetch({})
    const { container } = renderHome()
    expect(screen.getByRole('link', { name: /Price increase/ }).getAttribute('href')).toBe('/c/old')
    expect(await axe(container)).toHaveNoViolations()
  })
})
