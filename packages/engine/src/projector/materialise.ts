import type { RunEvent } from '@xo/db'
import { createUIMessageStream, readUIMessageStream } from 'ai'
import type { OpinionsUIMessage } from '../parts'
import type { RunStore } from '../store/types'
import { writeRunEvents } from './tail'

const LATE = new Set(['report_summary', 'report_summary_failed'])

const withLateSummaries = (all: RunEvent[]) => {
  const events = all.some((e) => e.kind === 'report_summary')
    ? all.filter((e) => e.kind !== 'report_summary_failed')
    : all
  const done = events.findIndex((e) => e.kind === 'done')
  if (done < 0) return events
  const late = events.slice(done + 1).filter((e) => LATE.has(e.kind))
  return [...events.slice(0, done), ...late, ...events.slice(done)]
}

export async function materialiseRun(store: RunStore, runId: string): Promise<OpinionsUIMessage['parts']> {
  const run = await store.get(runId)
  if (!run) throw new Error('run_not_found')
  const events = await store.listEvents(runId, 0)
  const stream = createUIMessageStream({
    execute({ writer }) {
      writer.write({ type: 'start', messageId: run.assistantMessageId })
      writeRunEvents((chunk) => writer.write(chunk), withLateSummaries(events))
    },
  })
  let parts: OpinionsUIMessage['parts'] = []
  for await (const message of readUIMessageStream<OpinionsUIMessage>({ stream })) parts = message.parts
  await store.setMessageParts(run.assistantMessageId, parts)
  return parts
}
