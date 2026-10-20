'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import type { OpinionsUIMessage } from '@xo/engine'
import { Conversation, ConversationContent, ConversationScrollButton } from '@/components/ai-elements/conversation'
import { Message, MessageContent } from '@/components/ai-elements/message'
import { PromptInput, PromptInputSubmit, PromptInputTextarea } from '@/components/ai-elements/prompt-input'
import { MessageParts } from './message-parts'

export function Chat({ chatId, initialMessages }: { chatId: string; initialMessages: OpinionsUIMessage[] }) {
  const { messages, sendMessage, status, stop } = useChat<OpinionsUIMessage>({
    id: chatId,
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
      <PromptInput onSubmit={({ text }) => (text.trim() ? sendMessage({ text }) : undefined)} className="mt-4">
        <PromptInputTextarea placeholder="Send a message" />
        <PromptInputSubmit status={status} onStop={stop} />
      </PromptInput>
    </div>
  )
}
