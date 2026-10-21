import type { RunEvent } from '@xo/db'
import { createUIMessageStream, type UIMessageChunk } from 'ai'
import type { EventKind } from '../events'
import type { RunStore } from '../store/types'
import { eventToChunks } from './to-chunks'

const IDLE_BACKOFF_MS = 30_000

export const writeRunEvents = (write: (chunk: UIMessageChunk) => void, events: RunEvent[]): boolean => {
  for (const event of events) {
    for (const chunk of eventToChunks({ ...event, kind: event.kind as EventKind })) write(chunk)
    if (event.kind === 'error') write({ type: 'finish' })
    if (event.kind === 'error' || event.kind === 'done') return true
  }
  return false
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) return resolve()
    const done = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
    const timer = setTimeout(done, ms)
    signal.addEventListener('abort', done, { once: true })
  })

export function tailRunAsUIMessageStream(input: {
  store: RunStore
  runId: string
  messageId: string
  pollMs?: number
  maxDurationMs?: number
  signal?: AbortSignal
}): ReadableStream<UIMessageChunk> {
  const { store, runId, messageId, pollMs = 1000, maxDurationMs, signal } = input
  const stop = new AbortController()
  const abort = () => stop.abort()

  const inner = createUIMessageStream({
    async execute({ writer }) {
      signal?.addEventListener('abort', abort, { once: true })
      if (signal?.aborted) abort()
      const deadline = maxDurationMs === undefined ? undefined : setTimeout(abort, maxDurationMs)
      try {
        writer.write({ type: 'start', messageId })
        if (!(await store.get(runId))) {
          writer.write({ type: 'error', errorText: 'run_not_found' })
          writer.write({ type: 'finish' })
          return
        }
        let afterSeq = 0
        let lastEventAt = Date.now()
        while (!stop.signal.aborted) {
          const events = await store.listEvents(runId, afterSeq)
          if (stop.signal.aborted) return
          if (events.length > 0) {
            if (writeRunEvents((chunk) => writer.write(chunk), events)) return
            afterSeq = events[events.length - 1]!.seq
            lastEventAt = Date.now()
          }
          await sleep(Date.now() - lastEventAt >= IDLE_BACKOFF_MS ? 2 * pollMs : pollMs, stop.signal)
        }
      } finally {
        clearTimeout(deadline)
        signal?.removeEventListener('abort', abort)
      }
    },
  })

  const reader = inner.getReader()
  return new ReadableStream<UIMessageChunk>({
    async pull(controller) {
      const { done, value } = await reader.read()
      if (done) controller.close()
      else controller.enqueue(value)
    },
    cancel(reason) {
      abort()
      return reader.cancel(reason)
    },
  })
}
