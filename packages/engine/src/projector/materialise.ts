import { createUIMessageStream, readUIMessageStream } from 'ai'
import type { OpinionsUIMessage } from '../parts'
import type { RunStore } from '../store/types'
import { writeRunEvents } from './tail'

export async function materialiseRun(store: RunStore, runId: string): Promise<OpinionsUIMessage['parts']> {
  const run = await store.get(runId)
  if (!run) throw new Error('run_not_found')
  const events = await store.listEvents(runId, 0)
  const stream = createUIMessageStream({
    execute({ writer }) {
      writer.write({ type: 'start', messageId: run.assistantMessageId })
      writeRunEvents((chunk) => writer.write(chunk), events)
    },
  })
  let parts: OpinionsUIMessage['parts'] = []
  for await (const message of readUIMessageStream<OpinionsUIMessage>({ stream })) parts = message.parts
  await store.setMessageParts(run.assistantMessageId, parts)
  return parts
}
