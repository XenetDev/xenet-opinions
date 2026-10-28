import type { OpinionsUIMessage, SourcesData } from '@xo/engine/parts'
import { FileTextIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import {
  Attachment,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from '@/components/ui/attachment'
import { Bubble, BubbleContent } from '@/components/ui/bubble'
import { Message, MessageContent, MessageHeader } from '@/components/ui/message'

export const ASSISTANT_NAME = 'Xenet Opinions'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function messageText(message: OpinionsUIMessage): string {
  return message.parts.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('\n')
}

export function UserTurn({ message, sources }: { message: OpinionsUIMessage; sources?: SourcesData }) {
  const text = messageText(message)
  return (
    <Message align="end" role="group" aria-label={`You: ${text}`}>
      <MessageContent className="min-w-0 items-end gap-1">
        {sources && sources.files.length > 0 && (
          <AttachmentGroup className="max-w-[85%] justify-end gap-1.5">
            {sources.files.map((file) => (
              <Attachment key={file.id} size="xs" className="max-w-52">
                <AttachmentMedia variant="icon" className="text-muted-foreground">
                  <FileTextIcon aria-hidden="true" />
                </AttachmentMedia>
                <AttachmentContent>
                  <AttachmentTitle className="text-[13px]">{file.filename}</AttachmentTitle>
                  <AttachmentDescription>{formatSize(file.sizeBytes)}</AttachmentDescription>
                </AttachmentContent>
              </Attachment>
            ))}
          </AttachmentGroup>
        )}
        <Bubble variant="muted" align="end" className="max-w-[85%]">
          <BubbleContent className="text-[15px]/6 whitespace-pre-wrap">{text}</BubbleContent>
        </Bubble>
      </MessageContent>
    </Message>
  )
}

export function AssistantTurn({ time, children }: { time?: string; children: ReactNode }) {
  return (
    <Message role="group" aria-label={ASSISTANT_NAME}>
      <MessageContent className="min-w-0 gap-2">
        <MessageHeader className="gap-x-2 pb-0.5 text-[13px]">
          <span className="font-medium text-foreground">{ASSISTANT_NAME}</span>
          {time && (
            <>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{time}</span>
            </>
          )}
        </MessageHeader>
        <Bubble variant="ghost" className="w-full min-w-0">
          <BubbleContent className="w-full min-w-0 space-y-3 text-[15px]/6">{children}</BubbleContent>
        </Bubble>
      </MessageContent>
    </Message>
  )
}
