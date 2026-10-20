import type { OpinionsUIMessage } from '@xo/engine'
import { MessageResponse } from '@/components/ai-elements/message'
import { PipelineTimeline } from './parts/pipeline-timeline'

export function MessageParts({ parts }: { parts: OpinionsUIMessage['parts'] }) {
  const stages = parts.flatMap((part) => (part.type === 'data-stage' ? [part.data] : []))

  return (
    <>
      {stages.length > 0 && <PipelineTimeline stages={stages} />}
      {parts.map((part, i) =>
        part.type === 'text' ? <MessageResponse key={i}>{part.text}</MessageResponse> : null,
      )}
    </>
  )
}
