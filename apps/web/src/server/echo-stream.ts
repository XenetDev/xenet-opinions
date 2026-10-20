import { createUIMessageStream, readUIMessageStream, type UIMessageChunk } from 'ai'
import { stagePartId, type OpinionsUIMessage } from '@xo/engine'

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export function createEchoStream(input: {
  assistantMessageId: string
  text: string
  delayMs?: number
}): ReadableStream<UIMessageChunk> {
  const { assistantMessageId, text, delayMs = 40 } = input
  const id = stagePartId('ontology')
  const words = text.split(' ')
  const deltas = ['You said: ', ...words.map((word, i) => (i < words.length - 1 ? `${word} ` : word))]

  return createUIMessageStream<OpinionsUIMessage>({
    execute: async ({ writer }) => {
      writer.write({ type: 'start', messageId: assistantMessageId })
      writer.write({ type: 'data-stage', id, data: { stage: 'ontology', status: 'running', progress: 0, message: 'Echoing' } })
      writer.write({ type: 'text-start', id: 't1' })
      for (const delta of deltas) {
        writer.write({ type: 'text-delta', id: 't1', delta })
        if (delayMs > 0) await sleep(delayMs)
      }
      writer.write({ type: 'text-end', id: 't1' })
      writer.write({ type: 'data-stage', id, data: { stage: 'ontology', status: 'done', progress: 100 } })
      writer.write({ type: 'finish' })
    },
  }) as ReadableStream<UIMessageChunk>
}

export async function persistAssistantParts(
  stream: ReadableStream<UIMessageChunk>,
  assistantMessageId: string,
  update: (id: string, parts: unknown[]) => Promise<void>,
): Promise<void> {
  let last: OpinionsUIMessage | undefined
  for await (const message of readUIMessageStream<OpinionsUIMessage>({ stream })) last = message
  if (last) await update(assistantMessageId, last.parts)
}
