'use client'

import { FileTextIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Attachment, AttachmentContent, AttachmentMedia, AttachmentTitle } from '@/components/ui/attachment'
import { Bubble, BubbleContent } from '@/components/ui/bubble'
import { Message, MessageContent, MessageHeader } from '@/components/ui/message'
import { cn } from '@/lib/utils'
import { ASSISTANT_NAME } from '@/modules/chat/thread/turn'
import { useSceneClock } from '../use-scene-clock'
import { ENTER, Scene } from './scene'

export const REPORT_LINES = [
  'Early posts criticised the timing.',
  'Sentiment stabilised by the midpoint.',
  'Small teams are the main churn risk.',
]
const SOURCES = ['pricing-brief.pdf', 'seed.md']
export const FOLLOW_UP = 'Which segment is most at risk?'
export const REPLY = 'Small teams: they name competitors most often.'
const STEPS = [800, 700, 700, 800, 1200, 1300, 3800]
const CHIPS = REPORT_LINES.length + 1
const ASKED = CHIPS + 1
const REPLIED = ASKED + 1

function AssistantBlock({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Message className={className}>
      <MessageContent className="min-w-0 gap-1">
        <MessageHeader className="gap-x-2 text-xs">
          <span className="font-medium text-foreground">{ASSISTANT_NAME}</span>
        </MessageHeader>
        <Bubble variant="ghost" className="w-full min-w-0">
          <BubbleContent className="w-full min-w-0 space-y-1.5 py-1 text-[13px]/5">{children}</BubbleContent>
        </Bubble>
      </MessageContent>
    </Message>
  )
}

export function ReportScene({ active }: { active: boolean }) {
  const phase = useSceneClock({ active, steps: STEPS })

  return (
    <Scene className="gap-2">
      <AssistantBlock>
        <p className="text-sm font-semibold">Public reaction to the price increase</p>
        {REPORT_LINES.slice(0, phase).map((line) => (
          <p key={line} className={ENTER}>
            {line}
          </p>
        ))}
        {phase >= CHIPS && (
          <div className={cn(ENTER, 'flex flex-wrap gap-1.5 pt-1')}>
            {SOURCES.map((file) => (
              <Attachment key={file} size="xs" className="min-w-0">
                <AttachmentMedia variant="icon" className="text-muted-foreground">
                  <FileTextIcon />
                </AttachmentMedia>
                <AttachmentContent>
                  <AttachmentTitle className="text-xs">{file}</AttachmentTitle>
                </AttachmentContent>
              </Attachment>
            ))}
          </div>
        )}
      </AssistantBlock>
      {phase >= ASKED && (
        <Message align="end" className={ENTER}>
          <MessageContent className="min-w-0 items-end">
            <Bubble variant="muted" align="end" className="max-w-[85%]">
              <BubbleContent className="py-1.5 text-[13px]/5">{FOLLOW_UP}</BubbleContent>
            </Bubble>
          </MessageContent>
        </Message>
      )}
      {phase >= REPLIED && (
        <AssistantBlock className={ENTER}>
          <p>{REPLY}</p>
        </AssistantBlock>
      )}
    </Scene>
  )
}
