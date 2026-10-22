import type { InterviewData } from '@xo/engine/parts'
import { MessageResponse } from '@/components/ai-elements/message'
import { Shimmer } from '@/components/ai-elements/shimmer'
import { Alert, AlertDescription } from '@/components/ui/alert'

export function InterviewCard({ data }: { data: InterviewData }) {
  return (
    <div className="flex flex-col gap-2 rounded-md border p-3" data-status={data.status}>
      <p className="text-sm font-medium">{data.agentName}</p>
      <p className="text-sm text-muted-foreground">{data.question}</p>
      {data.status === 'pending' && (
        <div data-testid="interview-pending">
          <Shimmer>Thinking…</Shimmer>
        </div>
      )}
      {data.status === 'done' && data.answer && <MessageResponse>{data.answer}</MessageResponse>}
      {data.status === 'failed' && (
        <Alert variant="destructive">
          <AlertDescription>{data.error ?? 'This persona could not answer.'}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
