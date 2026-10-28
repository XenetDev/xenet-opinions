import type { OpinionsUIMessage } from '@xo/engine/parts'
import { type ChatTransport, DefaultChatTransport, type UIMessageChunk } from 'ai'

type Stream = ReadableStream<UIMessageChunk>

const BACKOFF_MS = [1000, 2000, 4000, 5000]
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export function continueRunStream(
  first: Stream,
  next: (after: number) => Promise<Stream | null>,
  wait: (ms: number) => Promise<void> = sleep,
): Stream {
  let reader = first.getReader()
  let after = 0
  let ended = false
  let continuing = false
  let received = false
  let idle = 0
  let cancelled = false
  return new ReadableStream<UIMessageChunk>({
    async pull(controller) {
      while (true) {
        const { done, value } = await reader.read()
        if (!done) {
          if (value.type === 'finish' || value.type === 'error') ended = true
          if (value.type === 'data-cursor') after = (value.data as { seq: number }).seq
          if (continuing && value.type === 'start') continue
          if (value.type !== 'start') received = true
          controller.enqueue(value)
          return
        }
        if (cancelled) return
        if (ended) return controller.close()
        if (continuing && !received) await wait(BACKOFF_MS[Math.min(idle++, BACKOFF_MS.length - 1)]!)
        else idle = 0
        if (cancelled) return
        const stream = await next(after)
        if (cancelled) {
          await stream?.cancel()
          return
        }
        if (!stream) return controller.close()
        reader = stream.getReader()
        continuing = true
        received = false
      }
    },
    cancel(reason) {
      cancelled = true
      return reader.cancel(reason)
    },
  })
}

export function runTransport(chatId: string): ChatTransport<OpinionsUIMessage> {
  const base = new DefaultChatTransport<OpinionsUIMessage>({
    api: `/api/chats/${chatId}/messages`,
    prepareSendMessagesRequest: ({ id, messages, body }) => ({ body: { ...body, id, message: messages.at(-1) } }),
    prepareReconnectToStreamRequest: ({ id, requestMetadata }) => {
      const after = (requestMetadata as { after?: number } | undefined)?.after
      return { api: `/api/chats/${id}/stream${after === undefined ? '' : `?after=${after}`}` }
    },
  })
  const continued = (stream: Stream, chatId: string, abortSignal: AbortSignal | undefined) =>
    continueRunStream(stream, (after) => base.reconnectToStream({ chatId, abortSignal, metadata: { after } }))
  return {
    resumeStreamIsReplay: true,
    sendMessages: async (options) => continued(await base.sendMessages(options), options.chatId, options.abortSignal),
    reconnectToStream: async (options) => {
      const stream = await base.reconnectToStream({ ...options, metadata: undefined })
      return stream && continued(stream, options.chatId, options.abortSignal)
    },
  }
}
