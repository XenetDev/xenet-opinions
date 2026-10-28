// @vitest-environment jsdom

import { useChat } from '@ai-sdk/react'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { OpinionsUIMessage } from '@xo/engine/parts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runTransport } from './run-transport'

const sse = (chunks: unknown[]) =>
  new Response(chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join(''), {
    headers: { 'content-type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' },
  })

const cursor = (seq: number) => ({ type: 'data-cursor', id: 'cursor', data: { seq }, transient: true })
const stage = (status: string) => ({
  type: 'data-stage',
  id: 'stage:ontology',
  data: { stage: 'ontology', status },
})
const report = [
  { type: 'text-start', id: 'report' },
  { type: 'text-delta', id: 'report', delta: '# R' },
  { type: 'text-end', id: 'report' },
]

const fetchSpy = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>()

beforeEach(() => {
  fetchSpy.mockReset()
  vi.stubGlobal('fetch', fetchSpy)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const user: OpinionsUIMessage = { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'q' }] }

const mount = (messages: OpinionsUIMessage[] = [user]) => {
  const seen: { status: string; messages: OpinionsUIMessage[] }[] = []
  const hook = renderHook(() => {
    const chat = useChat<OpinionsUIMessage>({ id: 'c1', messages, transport: runTransport('c1') })
    seen.push({ status: chat.status, messages: chat.messages })
    return chat
  })
  return { ...hook, seen }
}

const urls = () => fetchSpy.mock.calls.map(([url]) => String(url))

describe('runTransport', () => {
  it('continues a run stream that ends before finish from the last cursor without rewriting parts', async () => {
    fetchSpy
      .mockResolvedValueOnce(sse([{ type: 'start', messageId: 'a1' }, ...report, cursor(5)]))
      .mockResolvedValueOnce(sse([{ type: 'start', messageId: 'a1' }, stage('running'), cursor(6), { type: 'finish' }]))
    const { result, seen } = mount()
    await act(() => result.current.sendMessage({ text: 'q' }))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(urls()).toEqual(['/api/chats/c1/messages', '/api/chats/c1/stream?after=5'])
    const assistants = result.current.messages.filter((message) => message.role === 'assistant')
    expect(assistants).toHaveLength(1)
    expect(assistants[0]!.parts).toEqual([
      { type: 'text', text: '# R', state: 'done' },
      { type: 'data-stage', id: 'stage:ontology', data: { stage: 'ontology', status: 'running' } },
    ])
    const firstText = seen.findIndex(({ messages }) => messages.some((m) => m.role === 'assistant' && m.parts.length))
    for (const { status, messages } of seen.slice(firstText, -1)) {
      expect(status).toBe('streaming')
      expect(messages.find((m) => m.id === 'a1')!.parts[0]).toEqual({ type: 'text', text: '# R', state: 'done' })
    }
  })

  it('reconnects from seq 0 when the chat resumes a stream it does not hold', async () => {
    fetchSpy.mockResolvedValueOnce(sse([{ type: 'start', messageId: 'a1' }, ...report, cursor(5), { type: 'finish' }]))
    const { result } = mount()
    await act(() => result.current.resumeStream())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(urls()).toEqual(['/api/chats/c1/stream?after=0'])
  })

  it('stops continuing when the run has ended', async () => {
    fetchSpy
      .mockResolvedValueOnce(sse([{ type: 'start', messageId: 'a1' }, stage('running'), cursor(3)]))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    const { result } = mount()
    await act(() => result.current.resumeStream())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(urls()).toEqual(['/api/chats/c1/stream?after=0', '/api/chats/c1/stream?after=3'])
    expect(result.current.messages.at(-1)!.parts).toEqual(
      [stage('running')].map(({ type, id, data }) => ({ type, id, data })),
    )
  })
})
