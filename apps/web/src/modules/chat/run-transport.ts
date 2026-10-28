import type { OpinionsUIMessage } from '@xo/engine/parts'
import { type ChatTransport, DefaultChatTransport, type UIMessageChunk } from 'ai'

type Stream = ReadableStream<UIMessageChunk>

export function continueRunStream(first: Stream, next: (after: number) => Promise<Stream | null>): Stream {
  let reader = first.getReader()
  let after = 0
  let finished = false
  let continuing = false
  let received = false
  return new ReadableStream<UIMessageChunk>({
    async pull(controller) {
      while (true) {
        const { done, value } = await reader.read()
        if (!done) {
          received = true
          if (value.type === 'finish') finished = true
          if (value.type === 'data-cursor') after = (value.data as { seq: number }).seq
          if (continuing && value.type === 'start') continue
          controller.enqueue(value)
          return
        }
        if (finished || (continuing && !received)) return controller.close()
        const stream = await next(after)
        if (!stream) return controller.close()
        reader = stream.getReader()
        continuing = true
        received = false
      }
    },
    cancel(reason) {
      return reader.cancel(reason)
    },
  })
}

export function runTransport(chatId: string): ChatTransport<OpinionsUIMessage> {
  let after = 0
  const base = new DefaultChatTransport<OpinionsUIMessage>({
    api: `/api/chats/${chatId}/messages`,
    prepareSendMessagesRequest: ({ id, messages, body }) => ({ body: { ...body, id, message: messages.at(-1) } }),
    prepareReconnectToStreamRequest: ({ id }) => ({ api: `/api/chats/${id}/stream?after=${after}` }),
  })
  const reconnect = (options: Parameters<typeof base.reconnectToStream>[0], seq: number) => {
    after = seq
    return base.reconnectToStream(options)
  }
  const continued = (stream: Stream, options: Parameters<typeof base.reconnectToStream>[0]) =>
    continueRunStream(stream, (seq) => reconnect(options, seq))
  return {
    resumeStreamIsReplay: true,
    sendMessages: async (options) =>
      continued(await base.sendMessages(options), { chatId: options.chatId, abortSignal: options.abortSignal }),
    reconnectToStream: async (options) => {
      const stream = await reconnect(options, 0)
      return stream && continued(stream, options)
    },
  }
}
