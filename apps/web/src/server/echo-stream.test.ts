import { readUIMessageStream, type UIMessageChunk } from 'ai'
import { describe, expect, it } from 'vitest'
import { createEchoStream } from '@/server/echo-stream'

async function collect(stream: ReadableStream<UIMessageChunk>) {
  const out: UIMessageChunk[] = []
  const reader = stream.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return out
    out.push(value)
  }
}

describe('createEchoStream', () => {
  it('emits start, running stage, text, done stage, finish in order', async () => {
    const chunks = await collect(createEchoStream({ assistantMessageId: 'a1', text: 'hi there', delayMs: 0 }))
    expect(chunks.map((c) => c.type)).toEqual([
      'start',
      'data-stage',
      'text-start',
      'text-delta',
      'text-delta',
      'text-delta',
      'text-end',
      'data-stage',
      'finish',
    ])
    expect(chunks[0]).toMatchObject({ messageId: 'a1' })
    expect(chunks[1]).toMatchObject({ id: 'stage:ontology', data: { stage: 'ontology', status: 'running', progress: 0, message: 'Echoing' } })
    expect(chunks.at(-2)).toMatchObject({ id: 'stage:ontology', data: { stage: 'ontology', status: 'done', progress: 100 } })
  })

  it('reduces to a single message with one stage part and full text', async () => {
    const msgs = []
    for await (const m of readUIMessageStream({ stream: createEchoStream({ assistantMessageId: 'a1', text: 'hi', delayMs: 0 }) })) msgs.push(m)
    const last = msgs.at(-1)!
    expect(last.parts.filter((p) => p.type === 'data-stage')).toHaveLength(1)
    expect(last.parts.find((p) => p.type === 'text')).toMatchObject({ text: 'You said: hi' })
    expect(last.parts.find((p) => p.type === 'data-stage')).toMatchObject({ data: { status: 'done', progress: 100 } })
  })
})
