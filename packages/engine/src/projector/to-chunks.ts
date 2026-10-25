import type { InferUIMessageChunk, UIMessageChunk } from 'ai'
import type { EventKind } from '../events'
import type { ErrorData, OpinionsUIMessage } from '../parts'

type DataChunk = Extract<InferUIMessageChunk<OpinionsUIMessage>, { type: `data-${string}` }>

export const eventToChunks = (event: {
  kind: EventKind
  partId: string | null
  payload: unknown
}): UIMessageChunk[] => {
  switch (event.kind) {
    case 'report_text':
      return [
        { type: 'text-start', id: 'report' },
        { type: 'text-delta', id: 'report', delta: (event.payload as { markdown: string }).markdown },
        { type: 'text-end', id: 'report' },
      ]
    case 'error':
      return [{ type: 'error', errorText: (event.payload as ErrorData).message }]
    case 'cancelled':
      return [{ type: 'abort', reason: (event.payload as { message: string }).message }, { type: 'finish' }]
    case 'done':
      return [{ type: 'finish' }]
    default:
      return [{ type: `data-${event.kind}`, id: event.partId ?? undefined, data: event.payload } as DataChunk]
  }
}
