import type { Message, Run } from '@xo/db'
import { type MiroFishClient, MiroFishError } from '@xo/mirofish'
import { readUIMessageStream, type UIMessageChunk } from 'ai'
import type { Table } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Write = { op: 'insert' | 'update' | 'delete'; table: string; arg?: unknown; tx: boolean }

const state = vi.hoisted(() => ({ log: [] as Write[], gate: null as Promise<void> | null }))

vi.mock('@/lib/db', async () => {
  const { getTableName } = await import('drizzle-orm')
  const ops = (tx: boolean) => {
    const builder = (op: Write['op'], table: Table) => {
      const entry: Write = { op, table: getTableName(table), tx }
      const chain = {
        values: (v: unknown) => {
          entry.arg = v
          return chain
        },
        set: (v: unknown) => {
          entry.arg = v
          return chain
        },
        where: () => chain,
        onConflictDoNothing: () => chain,
        // biome-ignore lint/suspicious/noThenProperty: the mock query builder must be thenable like Drizzle's
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
          state.log.push(entry)
          return Promise.resolve(undefined).then(resolve, reject)
        },
      }
      return chain
    }
    return {
      insert: (t: Table) => builder('insert', t),
      update: (t: Table) => builder('update', t),
      delete: (t: Table) => builder('delete', t),
    }
  }
  return {
    db: {
      ...ops(false),
      transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        if (state.gate) await state.gate
        return fn(ops(true))
      },
    },
  }
})
vi.mock('@/lib/mirofish', () => ({ mirofish: {} }))
vi.mock('./chats', () => ({ listMessages: vi.fn(), getMessage: vi.fn(), updateMessageParts: vi.fn() }))
vi.mock('./runs', () => ({ runStore: { update: vi.fn() } }))

import { getMessage, listMessages, updateMessageParts } from './chats'
import { FollowUpError, runFollowUp } from './follow-up'
import { runStore } from './runs'

const MIN = 60_000
const t0 = new Date('2026-01-01T00:00:00Z')
const at = (min: number) => new Date(t0.getTime() + min * MIN)

const roster = ['1', '2', '3', '4', '5', '6'].map((id) => ({ id, name: `Agent ${id}`, topics: [] }))
const agentsPart = (profiles: Array<{ id: string; name: string; topics: string[] }>) => ({
  type: 'data-agents',
  id: 'agents',
  data: { count: profiles.length, profiles },
})

const run = (over: Partial<Run> = {}): Run =>
  ({
    id: 'run1',
    chatId: 'c1',
    assistantMessageId: 'a0',
    status: 'done',
    ids: { simulationId: 'sim1' },
    envState: 'open',
    envKeepaliveUntil: at(20),
    finishedAt: t0,
    ...over,
  }) as Run

const msg = (id: string, role: string, parts: unknown[]): Message => ({ id, chatId: 'c1', role, parts, createdAt: t0 })
const userMessage = { id: 'u2', parts: [{ type: 'text', text: 'Why?' }] }

const fakeMirofish = () => {
  const chat = vi.fn()
  const interviewBatch = vi.fn()
  return {
    client: { report: { chat }, simulation: { interviewBatch } } as unknown as MiroFishClient,
    chat,
    interviewBatch,
  }
}

const call = (input: { target: 'report' | 'agents'; agentIds?: string[]; run?: Run; mirofish: MiroFishClient }) =>
  runFollowUp({
    chat: { id: 'c1' } as never,
    run: input.run ?? run(),
    userMessage,
    text: 'Why?',
    target: input.target,
    agentIds: input.agentIds ?? [],
    now: () => at(5),
    mirofish: input.mirofish,
  })

const chunkReader = (response: Response) => {
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader()
  const queue: UIMessageChunk[] = []
  let buffer = ''
  let ended = false
  const fill = async () => {
    const { done, value } = await reader.read()
    if (done) {
      ended = true
      return
    }
    buffer += value
    const lines = buffer.split('\n')
    buffer = lines.pop()!
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6)
      if (data !== '[DONE]') queue.push(JSON.parse(data))
    }
  }
  const take = async (n: number, timeoutMs = 200) => {
    const deadline = Date.now() + timeoutMs
    while (queue.length < n && !ended) {
      const remaining = deadline - Date.now()
      if (remaining <= 0) break
      await Promise.race([fill(), new Promise((r) => setTimeout(r, remaining))])
    }
    return queue.splice(0, n)
  }
  const rest = async () => {
    while (!ended) await fill()
    return queue.splice(0)
  }
  return { take, rest }
}

const allChunks = (response: Response) => chunkReader(response).rest()

const finalParts = async (chunks: UIMessageChunk[]) => {
  const stream = new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
  })
  let parts: unknown[] = []
  for await (const message of readUIMessageStream({ stream })) parts = message.parts
  return parts
}

const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((r) => (resolve = r))
  return { promise, resolve }
}

const turnWrites = (writes: Write[]) => writes.filter((w) => w.tx).slice(0, 3)

beforeEach(() => {
  vi.resetAllMocks()
  state.log.length = 0
  state.gate = null
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(getMessage).mockResolvedValue(msg('a0', 'assistant', [agentsPart(roster.slice(0, 2)), agentsPart(roster)]))
  vi.mocked(updateMessageParts).mockImplementation(async (id, parts) => {
    state.log.push({ op: 'update', table: 'messages', arg: { id, parts }, tx: false })
  })
})

describe('runFollowUp report', () => {
  const rows = [
    msg('u0', 'user', [{ type: 'text', text: 'Run it' }]),
    msg('a0', 'assistant', [{ type: 'text', text: 'Report' }]),
    msg('u1', 'user', [{ type: 'text', text: 'Earlier?' }]),
    msg('a1', 'assistant', [{ type: 'text', text: 'Earlier answer' }]),
    msg('u2', 'user', [{ type: 'text', text: 'Why?' }]),
  ]

  it('streams the reply after persisting it and sends history without the current message', async () => {
    const mf = fakeMirofish()
    mf.chat.mockResolvedValue({ response: 'Because.' })
    vi.mocked(listMessages).mockResolvedValue(rows)

    const response = await call({ target: 'report', mirofish: mf.client })
    const chunks = await allChunks(response)
    const assistantId = (chunks[0] as { messageId: string }).messageId

    expect(chunks).toEqual([
      { type: 'start', messageId: assistantId },
      { type: 'text-start', id: 'reply' },
      { type: 'text-delta', id: 'reply', delta: 'Because.' },
      { type: 'text-end', id: 'reply' },
      { type: 'finish' },
    ])
    expect(mf.chat).toHaveBeenCalledWith({
      simulationId: 'sim1',
      message: 'Why?',
      history: [
        { role: 'user', content: 'Earlier?' },
        { role: 'assistant', content: 'Earlier answer' },
      ],
    })
    expect(listMessages).toHaveBeenCalledWith('c1')
    expect(turnWrites(state.log).map((w) => [w.op, w.table])).toEqual([
      ['insert', 'messages'],
      ['insert', 'messages'],
      ['update', 'chats'],
    ])
    expect(state.log[0]!.arg).toMatchObject({ id: 'u2', chatId: 'c1', role: 'user', parts: userMessage.parts })
    expect(state.log[1]!.arg).toMatchObject({ id: assistantId, chatId: 'c1', role: 'assistant', parts: [] })
    const persisted = [{ type: 'text', text: 'Because.', state: 'done' }]
    expect(updateMessageParts).toHaveBeenCalledWith(assistantId, persisted)
    expect(await finalParts(chunks)).toEqual(persisted)
    expect(runStore.update).not.toHaveBeenCalled()
    expect(mf.interviewBatch).not.toHaveBeenCalled()
  })

  it('has no env precondition', async () => {
    const mf = fakeMirofish()
    mf.chat.mockResolvedValue({ response: 'Ok' })
    vi.mocked(listMessages).mockResolvedValue(rows)
    const response = await call({ target: 'report', run: run({ envState: 'closed' }), mirofish: mf.client })
    expect((await allChunks(response)).at(-1)).toEqual({ type: 'finish' })
  })

  it('withholds the reply chunks until the parts are persisted', async () => {
    const mf = fakeMirofish()
    mf.chat.mockResolvedValue({ response: 'Because.' })
    vi.mocked(listMessages).mockResolvedValue(rows)
    const gate = deferred()
    vi.mocked(updateMessageParts).mockImplementation(() => gate.promise)

    const reader = chunkReader(await call({ target: 'report', mirofish: mf.client }))
    expect((await reader.take(2)).map((c) => c.type)).toEqual(['start'])
    gate.resolve()
    expect((await reader.rest()).map((c) => c.type)).toEqual(['text-start', 'text-delta', 'text-end', 'finish'])
  })

  it('deletes the empty assistant row and streams an error when MiroFish fails', async () => {
    const mf = fakeMirofish()
    mf.chat.mockRejectedValue(new MiroFishError({ code: 'http', message: 'down', path: '/api/report/chat' }))
    vi.mocked(listMessages).mockResolvedValue(rows)

    const chunks = await allChunks(await call({ target: 'report', mirofish: mf.client }))
    const assistantId = (chunks[0] as { messageId: string }).messageId

    expect(chunks).toEqual([
      { type: 'start', messageId: assistantId },
      { type: 'error', errorText: 'follow_up_failed' },
    ])
    expect(state.log.filter((w) => w.op === 'delete').map((w) => w.table)).toEqual(['messages'])
    expect(updateMessageParts).not.toHaveBeenCalled()
  })
})

describe('runFollowUp agents', () => {
  const interview = (agentId: string, extra: Record<string, unknown>) => ({
    type: 'data-interview',
    id: `interview:${agentId}`,
    data: { agentId, agentName: `Agent ${agentId}`, question: 'Why?', ...extra },
  })

  it('streams pending cards before calling MiroFish, then the persisted results', async () => {
    const mf = fakeMirofish()
    const gate = deferred()
    mf.interviewBatch.mockImplementation(async () => {
      await gate.promise
      return { results: [{ agent_id: 3, response: 'Yes' }] }
    })

    const reader = chunkReader(await call({ target: 'agents', agentIds: ['3', '6'], mirofish: mf.client }))
    const head = await reader.take(3)
    const assistantId = (head[0] as { messageId: string }).messageId
    expect(head).toEqual([
      { type: 'start', messageId: assistantId },
      interview('3', { status: 'pending' }),
      interview('6', { status: 'pending' }),
    ])
    expect(mf.interviewBatch).toHaveBeenCalledWith({
      simulationId: 'sim1',
      interviews: [
        { agentId: 3, prompt: 'Why?' },
        { agentId: 6, prompt: 'Why?' },
      ],
    })
    expect(runStore.update).toHaveBeenCalledWith('run1', { envKeepaliveUntil: at(30) })
    expect(vi.mocked(runStore.update).mock.invocationCallOrder[0]!).toBeLessThan(
      mf.interviewBatch.mock.invocationCallOrder[0]!,
    )
    expect(state.log.some((w) => w.table === 'interviews')).toBe(false)

    gate.resolve()
    const tail = await reader.rest()
    const done = interview('3', { status: 'done', answer: 'Yes' })
    const failed = interview('6', { status: 'failed', error: 'No answer' })
    expect(tail).toEqual([done, failed, { type: 'finish' }])

    const persistTx = state.log.filter((w) => w.tx).slice(3)
    expect(persistTx.map((w) => [w.op, w.table])).toEqual([
      ['update', 'messages'],
      ['insert', 'interviews'],
    ])
    expect(persistTx[0]!.arg).toEqual({ parts: [done, failed] })
    expect(persistTx[1]!.arg).toEqual([
      expect.objectContaining({
        chatId: 'c1',
        runId: 'run1',
        messageId: assistantId,
        agentId: '3',
        agentName: 'Agent 3',
        question: 'Why?',
        answer: 'Yes',
        status: 'done',
      }),
      expect.objectContaining({
        chatId: 'c1',
        runId: 'run1',
        messageId: assistantId,
        agentId: '6',
        agentName: 'Agent 6',
        question: 'Why?',
        answer: null,
        status: 'failed',
      }),
    ])
    expect(await finalParts([...head, ...tail])).toEqual([done, failed])
    expect(mf.chat).not.toHaveBeenCalled()
  })

  it('withholds the result chunks until the results are persisted', async () => {
    const mf = fakeMirofish()
    const batch = deferred()
    mf.interviewBatch.mockImplementation(async () => {
      await batch.promise
      return { results: [{ agent_id: 3, response: 'Yes' }] }
    })
    const reader = chunkReader(await call({ target: 'agents', agentIds: ['3'], mirofish: mf.client }))
    expect((await reader.take(2)).map((c) => c.type)).toEqual(['start', 'data-interview'])
    const persist = deferred()
    state.gate = persist.promise
    batch.resolve()
    expect(await reader.take(1, 50)).toEqual([])
    persist.resolve()
    expect((await reader.rest()).map((c) => c.type)).toEqual(['data-interview', 'finish'])
  })

  it.each([
    ['timeout', new MiroFishError({ code: 'timeout', message: 't', path: '/x' }), 'No answer in time'],
    ['api', new MiroFishError({ code: 'api', message: 'a', path: '/x' }), 'Agents are offline'],
    ['http', new MiroFishError({ code: 'http', message: 'h', path: '/x' }), 'Agents are offline'],
    ['other', new Error('boom'), 'Interview failed'],
  ])('marks every card failed on a %s error and finishes', async (_name, error, message) => {
    const mf = fakeMirofish()
    mf.interviewBatch.mockRejectedValue(error)
    const chunks = await allChunks(await call({ target: 'agents', agentIds: ['1', '2'], mirofish: mf.client }))
    const failed = [
      interview('1', { status: 'failed', error: message }),
      interview('2', { status: 'failed', error: message }),
    ]
    expect(chunks.slice(3)).toEqual([...failed, { type: 'finish' }])
    expect(chunks.some((c) => c.type === 'error')).toBe(false)
    const persistTx = state.log.filter((w) => w.tx).slice(3)
    expect(persistTx[0]!.arg).toEqual({ parts: failed })
    expect((persistTx[1]!.arg as Array<{ status: string; answer: null }>).map((r) => [r.status, r.answer])).toEqual([
      ['failed', null],
      ['failed', null],
    ])
  })
})

describe('runFollowUp validation', () => {
  const rejects = async (input: Parameters<typeof call>[0], code: string) => {
    await expect(call(input)).rejects.toSatisfy((e) => e instanceof FollowUpError && e.code === code)
    expect(state.log).toEqual([])
    expect(runStore.update).not.toHaveBeenCalled()
  }

  it.each(['report', 'agents'] as const)('is unavailable for %s when the run has no simulation', async (target) => {
    const mf = fakeMirofish()
    await rejects({ target, agentIds: ['1'], run: run({ ids: {} }), mirofish: mf.client }, 'follow_up_unavailable')
    expect(mf.chat).not.toHaveBeenCalled()
  })

  it('rejects interviews when the env is not open', async () => {
    const mf = fakeMirofish()
    await rejects(
      { target: 'agents', agentIds: ['1'], run: run({ envState: 'closed' }), mirofish: mf.client },
      'env_closed',
    )
    expect(mf.interviewBatch).not.toHaveBeenCalled()
  })

  it.each([
    ['empty', []],
    ['duplicate', ['1', '1']],
    ['too many', ['1', '2', '3', '4', '5', '6']],
    ['unknown', ['1', '99']],
  ])('rejects %s agent ids', async (_name, agentIds) => {
    const mf = fakeMirofish()
    await rejects({ target: 'agents', agentIds, mirofish: mf.client }, 'invalid_body')
    expect(mf.interviewBatch).not.toHaveBeenCalled()
  })

  it('reads the roster from the last agents part of the run message', async () => {
    vi.mocked(getMessage).mockResolvedValue(
      msg('a0', 'assistant', [agentsPart(roster), agentsPart(roster.slice(0, 2))]),
    )
    await rejects({ target: 'agents', agentIds: ['3'], mirofish: fakeMirofish().client }, 'invalid_body')
    expect(getMessage).toHaveBeenCalledWith('a0')
  })
})
