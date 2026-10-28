import type { InterviewData } from '@xo/engine/parts'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Bubble, BubbleContent } from '@/components/ui/bubble'
import { Message, MessageAvatar, MessageContent, MessageHeader } from '@/components/ui/message'
import { Spinner } from '@/components/ui/spinner'
import { Markdown } from '../markdown'
import { initials } from './agent-roster'

export function InterviewCard({ data, showQuestion = true }: { data: InterviewData; showQuestion?: boolean }) {
  return (
    <Message role="group" aria-label={data.agentName} data-status={data.status}>
      <MessageAvatar aria-hidden="true" className="size-8 self-start text-xs font-medium">
        {initials(data.agentName)}
      </MessageAvatar>
      <MessageContent className="min-w-0 gap-1.5">
        <MessageHeader className="px-0 text-[13px]">
          <span className="font-medium text-foreground">{data.agentName}</span>
        </MessageHeader>
        {showQuestion && <p className="text-sm text-muted-foreground">{data.question}</p>}
        <Bubble variant="ghost" className="w-full min-w-0">
          <BubbleContent className="w-full min-w-0 text-sm/6 sm:text-[15px]/6">
            {data.status === 'pending' && (
              <div data-testid="interview-pending" className="flex items-center gap-2 text-sm">
                <Spinner
                  role="presentation"
                  aria-label={undefined}
                  aria-hidden="true"
                  className="text-muted-foreground motion-reduce:animate-none"
                />
                <span className="shimmer [--shimmer-duration:2.4s]">Thinking</span>
              </div>
            )}
            {data.status === 'done' && data.answer && <Markdown>{data.answer}</Markdown>}
            {data.status === 'failed' && (
              <Alert variant="destructive">
                <AlertDescription>{data.error ?? 'This persona could not answer.'}</AlertDescription>
              </Alert>
            )}
          </BubbleContent>
        </Bubble>
      </MessageContent>
    </Message>
  )
}
