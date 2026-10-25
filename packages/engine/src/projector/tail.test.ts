import type { UIMessageChunk } from 'ai'
import { readUIMessageStream } from 'ai'
import { describe, expect, it, vi } from 'vitest'
import type { OpinionsUIMessage } from '../parts'
import { createMemoryStore } from '../store/memory'
import { materialiseRun } from './materialise'
import { tailRunAsUIMessageStream } from './tail'

const setup = async () => {
  const store = createMemoryStore()
  const run = await store.create({
    chatId: 'c1',
    userId: 'u1',
    assistantMessageId: 'm1',
    config: { requirement: 'R', maxRounds: 2, uploadIds: [] },
  })
  return { store, runId: run.id }
}

const collect = async (stream: ReadableStream<UIMessageChunk>) => {
  const chunks: UIMessageChunk[] = []
  const reader = stream.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) return chunks
    chunks.push(value)
  }
}

describe('tailRunAsUIMessageStream', () => {
  it('streams events appended over time in order', async () => {
    const { store, runId } = await setup()
    const reader = tailRunAsUIMessageStream({ store, runId, messageId: 'm1', pollMs: 5 }).getReader()
    expect((await reader.read()).value).toEqual({ type: 'start', messageId: 'm1' })
    await store.appendEvent(runId, {
      kind: 'stage',
      partId: 'stage:ontology',
      payload: { stage: 'ontology', status: 'running' },
    })
    expect((await reader.read()).value).toEqual({
      type: 'data-stage',
      id: 'stage:ontology',
      data: { stage: 'ontology', status: 'running' },
    })
    await store.appendEvent(runId, {
      kind: 'ontology',
      partId: 'ontology',
      payload: { entityTypes: ['A'], relationTypes: ['R'] },
    })
    expect((await reader.read()).value).toEqual({
      type: 'data-ontology',
      id: 'ontology',
      data: { entityTypes: ['A'], relationTypes: ['R'] },
    })
    await store.appendEvent(runId, { kind: 'done', partId: null, payload: {} })
    expect((await reader.read()).value).toEqual({ type: 'finish' })
    expect((await reader.read()).done).toBe(true)
  })

  it('emits the same id for a repeated partId', async () => {
    const { store, runId } = await setup()
    await store.appendEvent(runId, {
      kind: 'stage',
      partId: 'stage:graph_build',
      payload: { stage: 'graph_build', status: 'running', progress: 10 },
    })
    await store.appendEvent(runId, {
      kind: 'stage',
      partId: 'stage:graph_build',
      payload: { stage: 'graph_build', status: 'running', progress: 60 },
    })
    await store.appendEvent(runId, { kind: 'done', partId: null, payload: {} })
    const chunks = await collect(tailRunAsUIMessageStream({ store, runId, messageId: 'm1', pollMs: 5 }))
    const stages = chunks.filter((c) => c.type === 'data-stage')
    expect(stages).toHaveLength(2)
    expect(stages.map((c) => (c as { id: string }).id)).toEqual(['stage:graph_build', 'stage:graph_build'])
  })

  it('ends with finish after done', async () => {
    const { store, runId } = await setup()
    await store.appendEvent(runId, { kind: 'report_text', partId: 'report', payload: { markdown: '# R' } })
    await store.appendEvent(runId, { kind: 'done', partId: null, payload: {} })
    const chunks = await collect(tailRunAsUIMessageStream({ store, runId, messageId: 'm1', pollMs: 5 }))
    expect(chunks.map((c) => c.type)).toEqual(['start', 'text-start', 'text-delta', 'text-end', 'finish'])
  })

  it('ends with error then finish after an error event', async () => {
    const { store, runId } = await setup()
    await store.appendEvent(runId, {
      kind: 'stage',
      partId: 'stage:ontology',
      payload: { stage: 'ontology', status: 'failed', message: 'boom' },
    })
    await store.appendEvent(runId, {
      kind: 'error',
      partId: null,
      payload: { stage: 'ontology', code: 'api', message: 'boom' },
    })
    const chunks = await collect(tailRunAsUIMessageStream({ store, runId, messageId: 'm1', pollMs: 5 }))
    expect(chunks.slice(-2)).toEqual([{ type: 'error', errorText: 'boom' }, { type: 'finish' }])
  })

  it('ends with abort then finish after a cancelled event', async () => {
    const { store, runId } = await setup()
    await store.appendEvent(runId, {
      kind: 'stage',
      partId: 'stage:sim_run',
      payload: { stage: 'sim_run', status: 'cancelled', message: 'Cancelled by user' },
    })
    await store.appendEvent(runId, {
      kind: 'cancelled',
      partId: null,
      payload: { stage: 'sim_run', message: 'Cancelled by user' },
    })
    const chunks = await collect(tailRunAsUIMessageStream({ store, runId, messageId: 'm1', pollMs: 5 }))
    expect(chunks.slice(-2)).toEqual([{ type: 'abort', reason: 'Cancelled by user' }, { type: 'finish' }])
    expect(chunks.filter((c) => c.type === 'finish')).toHaveLength(1)
  })

  it('ends without finish when maxDurationMs elapses on an idle run', async () => {
    const { store, runId } = await setup()
    await store.appendEvent(runId, {
      kind: 'stage',
      partId: 'stage:ontology',
      payload: { stage: 'ontology', status: 'running' },
    })
    const chunks = await collect(
      tailRunAsUIMessageStream({ store, runId, messageId: 'm1', pollMs: 5, maxDurationMs: 50 }),
    )
    expect(chunks.map((c) => c.type)).toEqual(['start', 'data-stage'])
  })

  it('ends without finish when the signal aborts', async () => {
    const { store, runId } = await setup()
    const controller = new AbortController()
    const reader = tailRunAsUIMessageStream({
      store,
      runId,
      messageId: 'm1',
      pollMs: 5,
      signal: controller.signal,
    }).getReader()
    expect((await reader.read()).value).toEqual({ type: 'start', messageId: 'm1' })
    controller.abort()
    expect((await reader.read()).done).toBe(true)
  })

  it('stops polling when the consumer cancels', async () => {
    const { store, runId } = await setup()
    const listEvents = vi.spyOn(store, 'listEvents')
    const reader = tailRunAsUIMessageStream({ store, runId, messageId: 'm1', pollMs: 5 }).getReader()
    await reader.read()
    await reader.cancel()
    await new Promise((r) => setTimeout(r, 20))
    const calls = listEvents.mock.calls.length
    await new Promise((r) => setTimeout(r, 30))
    expect(listEvents.mock.calls.length).toBe(calls)
  })

  it('reports run_not_found for a missing run', async () => {
    const { store } = await setup()
    const chunks = await collect(tailRunAsUIMessageStream({ store, runId: 'nope', messageId: 'm1', pollMs: 5 }))
    expect(chunks).toEqual([
      { type: 'start', messageId: 'm1' },
      { type: 'error', errorText: 'run_not_found' },
      { type: 'finish' },
    ])
  })

  it('ends after start without finish when the signal is already aborted', async () => {
    const { store, runId } = await setup()
    const chunks = await collect(
      tailRunAsUIMessageStream({ store, runId, messageId: 'm1', pollMs: 5, signal: AbortSignal.abort() }),
    )
    expect(chunks).toEqual([{ type: 'start', messageId: 'm1' }])
  })

  it('writes an error chunk then ends when listEvents throws', async () => {
    const { store, runId } = await setup()
    vi.spyOn(store, 'listEvents').mockRejectedValue(new Error('db down'))
    const chunks = await collect(tailRunAsUIMessageStream({ store, runId, messageId: 'm1', pollMs: 5 }))
    expect(chunks).toEqual([
      { type: 'start', messageId: 'm1' },
      { type: 'error', errorText: 'An error occurred.' },
    ])
  })

  it('a second tail from seq 0 after a partial first tail reconciles to the materialised parts', async () => {
    const { store, runId } = await setup()
    await store.appendEvent(runId, {
      kind: 'stage',
      partId: 'stage:ontology',
      payload: { stage: 'ontology', status: 'running' },
    })
    await store.appendEvent(runId, {
      kind: 'stage',
      partId: 'stage:ontology',
      payload: { stage: 'ontology', status: 'done' },
    })
    await store.appendEvent(runId, {
      kind: 'ontology',
      partId: 'ontology',
      payload: { entityTypes: ['A'], relationTypes: ['R'] },
    })
    await store.appendEvent(runId, {
      kind: 'stage',
      partId: 'stage:graph_build',
      payload: { stage: 'graph_build', status: 'running', progress: 10 },
    })
    await store.appendEvent(runId, {
      kind: 'stage',
      partId: 'stage:graph_build',
      payload: { stage: 'graph_build', status: 'running', progress: 60 },
    })
    const [firstStream, firstChunks] = tailRunAsUIMessageStream({
      store,
      runId,
      messageId: 'm1',
      pollMs: 5,
      maxDurationMs: 30,
    }).tee()
    const firstTypes = collect(firstChunks).then((chunks) => chunks.map((c) => c.type))
    let held: OpinionsUIMessage | undefined
    for await (const message of readUIMessageStream<OpinionsUIMessage>({ stream: firstStream })) held = message
    expect(await firstTypes).not.toContain('finish')
    expect(held!.parts.length).toBeGreaterThan(0)
    await store.appendEvent(runId, {
      kind: 'stage',
      partId: 'stage:graph_build',
      payload: { stage: 'graph_build', status: 'done' },
    })
    await store.appendEvent(runId, {
      kind: 'stage',
      partId: 'stage:sim_run',
      payload: { stage: 'sim_run', status: 'running' },
    })
    await store.appendEvent(runId, { kind: 'report_text', partId: 'report', payload: { markdown: '# R' } })
    await store.appendEvent(runId, { kind: 'done', partId: null, payload: {} })
    const stream = tailRunAsUIMessageStream({ store, runId, messageId: 'm1', pollMs: 5 })
    let parts: OpinionsUIMessage['parts'] = []
    for await (const message of readUIMessageStream<OpinionsUIMessage>({ stream, message: held })) parts = message.parts
    expect(parts).toEqual(await materialiseRun(store, runId))
  })

  it('writes data-queue only when the position changes, then position 0 before the first event', async () => {
    const { store, runId } = await setup()
    const positions = [2, 2, 1]
    let calls = 0
    const queuePosition = vi.fn(async () => {
      calls++
      return positions[Math.min(calls - 1, positions.length - 1)]!
    })
    const reader = tailRunAsUIMessageStream({ store, runId, messageId: 'm1', pollMs: 5, queuePosition }).getReader()
    expect((await reader.read()).value).toEqual({ type: 'start', messageId: 'm1' })
    expect((await reader.read()).value).toEqual({ type: 'data-queue', id: 'queue', data: { position: 2 } })
    expect((await reader.read()).value).toEqual({ type: 'data-queue', id: 'queue', data: { position: 1 } })
    await store.appendEvent(runId, {
      kind: 'stage',
      partId: 'stage:ontology',
      payload: { stage: 'ontology', status: 'running' },
    })
    expect((await reader.read()).value).toEqual({ type: 'data-queue', id: 'queue', data: { position: 0 } })
    expect((await reader.read()).value).toEqual({
      type: 'data-stage',
      id: 'stage:ontology',
      data: { stage: 'ontology', status: 'running' },
    })
    await reader.cancel()
  })

  it('never writes data-queue without the option', async () => {
    const { store, runId } = await setup()
    await store.appendEvent(runId, { kind: 'done', partId: null, payload: {} })
    const chunks = await collect(tailRunAsUIMessageStream({ store, runId, messageId: 'm1', pollMs: 5 }))
    expect(chunks.some((c) => c.type === 'data-queue')).toBe(false)
  })

  it('writes nothing for a null position and still writes 0 on the first event, only once', async () => {
    const { store, runId } = await setup()
    const queuePosition = vi.fn(async () => null)
    const reader = tailRunAsUIMessageStream({ store, runId, messageId: 'm1', pollMs: 5, queuePosition }).getReader()
    expect((await reader.read()).value).toEqual({ type: 'start', messageId: 'm1' })
    await new Promise((r) => setTimeout(r, 30))
    expect(queuePosition).toHaveBeenCalled()
    await store.appendEvent(runId, {
      kind: 'stage',
      partId: 'stage:ontology',
      payload: { stage: 'ontology', status: 'running' },
    })
    expect((await reader.read()).value).toEqual({ type: 'data-queue', id: 'queue', data: { position: 0 } })
    expect((await reader.read()).value).toMatchObject({ type: 'data-stage' })
    const calls = queuePosition.mock.calls.length
    await store.appendEvent(runId, {
      kind: 'stage',
      partId: 'stage:ontology',
      payload: { stage: 'ontology', status: 'done' },
    })
    expect((await reader.read()).value).toMatchObject({ type: 'data-stage', data: { status: 'done' } })
    await new Promise((r) => setTimeout(r, 30))
    expect(queuePosition.mock.calls.length).toBe(calls)
    await reader.cancel()
  })
})
