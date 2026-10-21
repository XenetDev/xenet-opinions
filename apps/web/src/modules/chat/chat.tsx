'use client'

import { useChat } from '@ai-sdk/react'
import { useState } from 'react'
import { DefaultChatTransport } from 'ai'
import type { OpinionsUIMessage } from '@xo/engine/parts'
import { Conversation, ConversationContent, ConversationScrollButton } from '@/components/ai-elements/conversation'
import { Message, MessageContent } from '@/components/ai-elements/message'
import { Composer } from './composer/composer'
import { MessageParts } from './message-parts'

export function Chat({
  chatId,
  initialMessages,
  initialRunActive = false,
}: {
  chatId: string
  initialMessages: OpinionsUIMessage[]
  initialRunActive?: boolean
}) {
  const [notice, setNotice] = useState<string | null>(null)
  const { messages, sendMessage, status, stop } = useChat<OpinionsUIMessage>({
    id: chatId,
    onError: (error) => {
      if (/run_active|run_finished/.test(error.message)) {
        setNotice(
          error.message.includes('run_finished')
            ? 'This run has finished. Start a new chat to continue.'
            : 'A run is already in progress for this chat.',
        )
      } else {
        setNotice('Something went wrong sending your message')
      }
    },
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: `/api/chats/${chatId}/messages`,
      prepareSendMessagesRequest: ({ id, messages, body }) => ({ body: { ...body, id, message: messages.at(-1) } }),
    }),
  })

  return (
    <div className="mx-auto flex h-dvh w-full max-w-3xl flex-col p-4">
      <Conversation className="min-h-0 flex-1">
        <ConversationContent>
          {messages.map((message) => (
            <Message key={message.id} from={message.role}>
              <MessageContent>
                <MessageParts parts={message.parts} />
              </MessageContent>
            </Message>
          ))}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      {notice && (
        <p role="status" className="mt-2 text-sm text-muted-foreground">
          {notice}
        </p>
      )}
      <Composer
        chatId={chatId}
        status={status}
        onStop={stop}
        disabled={status === 'submitted' || status === 'streaming' || initialRunActive}
        onSend={async (text, uploadIds, runOptions) => {
          setNotice(null)
          void sendMessage({ text }, { body: { uploadIds, runOptions } })
        }}
      />
    </div>
  )
}
