'use client'

import { useChat } from '@ai-sdk/react'
import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { DefaultChatTransport } from 'ai'
import type { OpinionsUIMessage, Stage } from '@xo/engine/parts'
import { Conversation, ConversationContent, ConversationScrollButton } from '@/components/ai-elements/conversation'
import { Message, MessageContent } from '@/components/ai-elements/message'
import { useChatList } from '@/modules/sidebar/chat-list-context'
import { Composer } from './composer/composer'
import { MessageParts } from './message-parts'
import { useRunStatus } from './use-run-status'

const CANCEL_NOTICES: Record<string, string> = {
  run_not_active: 'The run has already finished',
  not_found: 'There is no run to cancel yet',
}

export function Chat({
  chatId,
  initialMessages,
  activeRun,
  initialText,
}: {
  chatId: string
  initialMessages: OpinionsUIMessage[]
  activeRun: { id: string; assistantMessageId: string; stage: Stage } | null
  initialText?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const { chats, upsertChat } = useChatList()
  const runActiveRef = useRef(!!activeRun)
  const [notice, setNotice] = useState<string | null>(null)
  const [watching, setWatching] = useState(!!activeRun)
  const [sendCount, setSendCount] = useState(0)
  const { messages, sendMessage, status, stop, resumeStream } = useChat<OpinionsUIMessage>({
    id: chatId,
    onError: (error) => {
      if (/run_active|run_finished/.test(error.message)) {
        setNotice(
          error.message.includes('run_finished')
            ? 'This run has finished. Start a new chat to continue.'
            : 'A run is already in progress for this chat.',
        )
      } else if (!runActiveRef.current) {
        setNotice('Something went wrong sending your message')
      }
    },
    messages: initialMessages,
    resume: !!activeRun,
    transport: new DefaultChatTransport({
      api: `/api/chats/${chatId}/messages`,
      prepareSendMessagesRequest: ({ id, messages, body }) => ({ body: { ...body, id, message: messages.at(-1) } }),
      prepareReconnectToStreamRequest: ({ id }) => ({ api: `/api/chats/${id}/stream` }),
    }),
  })
  const run = useRunStatus(chatId, {
    enabled: watching,
    sendCount,
    initial: activeRun
      ? { status: 'running', stage: activeRun.stage, runId: activeRun.id, assistantMessageId: activeRun.assistantMessageId }
      : undefined,
  })
  const resumeGuard = useRef(!!activeRun)
  const runActive = run.status === 'queued' || run.status === 'running'

  const wasActive = useRef(runActive)
  const lastPoll = useRef(run)

  useEffect(() => {
    if (status === 'streaming') resumeGuard.current = false
  }, [status])

  useEffect(() => {
    if (runActive && !wasActive.current) resumeGuard.current = false
    wasActive.current = runActive
    runActiveRef.current = runActive
  }, [runActive])

  useEffect(() => {
    if (!runActive || (status !== 'ready' && status !== 'error')) return
    if (status === 'error' && lastPoll.current !== run) resumeGuard.current = false
    lastPoll.current = run
    if (resumeGuard.current) return
    resumeGuard.current = true
    void resumeStream()
  }, [run, runActive, status, resumeStream])

  useEffect(() => {
    if (status === 'ready' && (run.status === 'done' || run.status === 'failed' || run.status === 'cancelled')) setWatching(false)
  }, [run.status, status])

  const errorOf = async (response: Response | null, fallback: string) => {
    const body = (await response?.json().catch(() => null)) as { error?: string } | null
    return body?.error ?? fallback
  }

  const handleStop = async () => {
    const shouldCancel = runActive || status === 'submitted' || status === 'streaming'
    if (!shouldCancel) {
      void stop()
      return
    }
    const response = await fetch(`/api/chats/${chatId}/run/cancel`, { method: 'POST' }).catch(() => null)
    if (response?.ok) {
      setNotice('Run cancelled')
      return
    }
    void stop()
    const code = await errorOf(response, 'cancel_failed')
    setNotice(CANCEL_NOTICES[code] ?? 'Something went wrong cancelling the run')
  }

  const handleRetry = async () => {
    setNotice(null)
    const response = await fetch(`/api/chats/${chatId}/run/retry`, { method: 'POST' }).catch(() => null)
    if (response?.status === 201) router.refresh()
    else setNotice(await errorOf(response, 'Something went wrong retrying the run'))
  }

  const lastMessage = messages.at(-1)
  const latestFailed =
    run.status === 'failed' || (run.status === 'none' && !!lastMessage?.parts.some((part) => part.type === 'data-error'))

  return (
    <div className="mx-auto flex h-[calc(100dvh-3rem)] w-full max-w-3xl flex-col p-4">
      <Conversation className="min-h-0 flex-1">
        <ConversationContent>
          {messages.map((message) => (
            <Message key={message.id} from={message.role}>
              <MessageContent>
                <MessageParts
                  parts={message.parts}
                  onRetry={
                    latestFailed && message === lastMessage && message.role === 'assistant' ? () => void handleRetry() : undefined
                  }
                />
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
        initialText={initialText}
        status={status}
        onStop={() => void handleStop()}
        disabled={status === 'submitted' || status === 'streaming' || runActive}
        onSend={async (text, uploadIds, runOptions) => {
          setNotice(null)
          const title = chats.find((chat) => chat.id === chatId)?.title
          upsertChat({ id: chatId, runStatus: 'queued', ...(!title && { title: text.slice(0, 60) }) })
          if (initialText) window.history.replaceState(null, '', pathname)
          setSendCount((count) => count + 1)
          setWatching(true)
          void sendMessage({ text }, { body: { uploadIds, runOptions } })
        }}
      />
    </div>
  )
}
