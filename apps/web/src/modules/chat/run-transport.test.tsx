// @vitest-environment jsdom

import { useChat } from '@ai-sdk/react'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { OpinionsUIMessage } from '@xo/engine/parts'
import type { UIMessageChunk } from 'ai'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { continueRunStream, runTransport } from './run-transport'

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
    const ontology = { type: 'data-ontology', id: 'ontology', data: { entityTypes: ['A'], relationTypes: ['R'] } }
    fetchSpy
      .mockResolvedValueOnce(sse([{ type: 'start', messageId: 'a1' }, stage('running'), ...report, cursor(5)]))
      .mockResolvedValueOnce(sse([{ type: 'start', messageId: 'a1' }, ontology, cursor(6), { type: 'finish' }]))
    const { result, seen } = mount()
    await act(() => result.current.sendMessage({ text: 'q' }))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(urls()).toEqual(['/api/chats/c1/messages', '/api/chats/c1/stream?after=5'])
    const assistants = result.current.messages.filter((message) => message.role === 'assistant')
    expect(assistants).toHaveLength(1)
    expect(assistants[0]!.parts).toEqual([
      { type: 'data-stage', id: 'stage:ontology', data: { stage: 'ontology', status: 'running' } },
      { type: 'text', text: '# R', state: 'done' },
      { type: 'data-ontology', id: 'ontology', data: ontology.data },
    ])
    const held = seen.findIndex(({ messages }) => messages.some((m) => m.id === 'a1' && m.parts.length > 1))
    const stageData = (seen[held]!.messages.find((m) => m.id === 'a1')!.parts[0] as { data: unknown }).data
    for (const { status, messages } of seen.slice(held, -1)) {
      expect(status).toBe('streaming')
      const parts = messages.find((m) => m.id === 'a1')!.parts
      expect((parts[0] as { data: unknown }).data).toBe(stageData)
      expect(parts[1]).toEqual({ type: 'text', text: '# R', state: 'done' })
    }
    expect((assistants[0]!.parts[0] as { data: unknown }).data).toBe(stageData)
  })

  it('builds each continuation URL from its own cursor when two continue at once', async () => {
    const transport = runTransport('c1')
    fetchSpy.mockImplementation(async (url) => {
      if (url === '/api/chats/c1/stream') return sse([])
      return sse([{ type: 'finish' }])
    })
    const open = async (seq: number) => {
      fetchSpy.mockResolvedValueOnce(sse([{ type: 'start', messageId: 'a1' }, cursor(seq)]))
      return (await transport.reconnectToStream({ chatId: 'c1' }))!
    }
    const [a, b] = [await open(5), await open(9)]
    const drain = async (stream: ReadableStream<unknown>) => {
      for await (const _ of stream as unknown as AsyncIterable<unknown>);
    }
    await Promise.all([drain(a), drain(b)])
    expect(
      urls()
        .filter((url) => url.includes('after'))
        .sort(),
    ).toEqual(['/api/chats/c1/stream?after=5', '/api/chats/c1/stream?after=9'])
  })

  it('replays from the start, without a cursor, when the chat resumes a stream it does not hold', async () => {
    fetchSpy.mockResolvedValueOnce(sse([{ type: 'start', messageId: 'a1' }, ...report, cursor(5), { type: 'finish' }]))
    const { result } = mount()
    await act(() => result.current.resumeStream())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(urls()).toEqual(['/api/chats/c1/stream'])
  })

  it('stops continuing when the run has ended', async () => {
    fetchSpy
      .mockResolvedValueOnce(sse([{ type: 'start', messageId: 'a1' }, stage('running'), cursor(3)]))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    const { result } = mount()
    await act(() => result.current.resumeStream())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(urls()).toEqual(['/api/chats/c1/stream', '/api/chats/c1/stream?after=3'])
    expect(result.current.messages.at(-1)!.parts).toEqual(
      [stage('running')].map(({ type, id, data }) => ({ type, id, data })),
    )
  })
})

const chunks = (list: unknown[]) =>
  new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of list) controller.enqueue(chunk as UIMessageChunk)
      controller.close()
    },
  })
const readAll = async (stream: ReadableStream<UIMessageChunk>) => {
  const out: UIMessageChunk[] = []
  for await (const chunk of stream as unknown as AsyncIterable<UIMessageChunk>) out.push(chunk)
  return out
}
const start = { type: 'start', messageId: 'a1' }

describe('continueRunStream', () => {
  it('stops after an error chunk without reconnecting', async () => {
    const next = vi.fn(async () => chunks([start]))
    const out = await readAll(continueRunStream(chunks([start, cursor(2), { type: 'error', errorText: 'boom' }]), next))
    expect(out.at(-1)).toEqual({ type: 'error', errorText: 'boom' })
    expect(next).not.toHaveBeenCalled()
  })

  it('cancels a body that arrives after the consumer cancelled', async () => {
    let resolve!: (stream: ReadableStream<UIMessageChunk>) => void
    const next = vi.fn(() => new Promise<ReadableStream<UIMessageChunk>>((r) => (resolve = r)))
    const reader = continueRunStream(chunks([start]), next).getReader()
    await reader.read()
    const pending = reader.read()
    await vi.waitFor(() => expect(next).toHaveBeenCalled())
    const cancelBody = vi.fn()
    await reader.cancel()
    resolve(new ReadableStream<UIMessageChunk>({ cancel: cancelBody }))
    await pending
    await vi.waitFor(() => expect(cancelBody).toHaveBeenCalled())
  })

  it('backs off between continuations that bring no events and resets once events arrive', async () => {
    const bodies = [
      [start],
      [start],
      [],
      [start],
      [start],
      [start, stage('running'), cursor(4)],
      [start],
      [start, { type: 'finish' }],
    ]
    const next = vi.fn(async (_after: number) => chunks(bodies.shift()!))
    const wait = vi.fn(async (_ms: number) => {})
    const out = await readAll(continueRunStream(chunks([start, cursor(3)]), next, wait))
    expect(wait.mock.calls.map(([ms]) => ms)).toEqual([1000, 2000, 4000, 5000, 5000, 1000])
    expect(next.mock.calls.map(([after]) => after)).toEqual([3, 3, 3, 3, 3, 3, 4, 4])
    expect(out.filter((chunk) => chunk.type === 'start')).toHaveLength(1)
    expect(out.at(-1)).toEqual({ type: 'finish' })
  })
})
