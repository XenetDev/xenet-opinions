'use client'

import { useChat } from '@ai-sdk/react'
import type { OpinionsUIMessage, Stage } from '@xo/engine/parts'
import { DefaultChatTransport } from 'ai'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Conversation, ConversationContent, ConversationScrollButton } from '@/components/ai-elements/conversation'
import { Message, MessageContent } from '@/components/ai-elements/message'
import { useChatList } from '@/modules/sidebar/chat-list-context'
import type { Limits } from '@/server/limits'
import { Composer } from './composer/composer'
import { EnvBadge } from './env-badge'
import { InterviewSelectionProvider } from './interview-selection'
import { MessageParts } from './message-parts'
import { NoticeRegion } from './notice-region'
import { type EnvState, useEnvStatus } from './use-env-status'
import { useRunStatus } from './use-run-status'

const CANCEL_NOTICES: Record<string, string> = {
  run_not_active: 'The run has already finished',
  not_found: 'There is no run to cancel yet',
}

const SEND_NOTICES: Record<string, string> = {
  run_active: 'A run is already in progress for this chat.',
  env_closed: 'The personas for this conversation are offline now. You can still ask the report.',
  follow_up_failed: 'The report agent did not answer. Try again.',
  follow_up_unavailable: 'Follow-ups are not available for this run.',
  demo_paused: 'The demo is paused right now. Try again later.',
}

const quotaNotice = (runs: number) =>
  `You've used today's ${runs === 1 ? '' : `${runs === 2 ? 'two' : runs} `}run${runs === 1 ? '' : 's'}. Come back tomorrow.`

type LatestRun = {
  id: string
  status: string
  assistantMessageId: string
  envState: EnvState
  envKeepaliveUntil: string | null
}

export function Chat({
  chatId,
  initialMessages,
  activeRun,
  latestRun,
  initialText,
  limits,
}: {
  chatId: string
  initialMessages: OpinionsUIMessage[]
  activeRun: { id: string; assistantMessageId: string; stage: Stage } | null
  latestRun: LatestRun | null
  initialText?: string
  limits: Limits
}) {
  const router = useRouter()
  const pathname = usePathname()
  const { chats, upsertChat } = useChatList()
  const runActiveRef = useRef(!!activeRun)
  const [notice, setNotice] = useState<string | null>(null)
  const [watching, setWatching] = useState(!!activeRun)
  const [sendCount, setSendCount] = useState(0)
  const [envRefreshKey, setEnvRefreshKey] = useState(0)
  const followUpRef = useRef(false)
  const { messages, sendMessage, status, stop, resumeStream } = useChat<OpinionsUIMessage>({
    id: chatId,
    onFinish: () => {
      if (followUpRef.current) setEnvRefreshKey((key) => key + 1)
    },
    onError: (error) => {
      const notices: Record<string, string> = {
        ...SEND_NOTICES,
        quota_exceeded: quotaNotice(limits.maxRunsPerDay),
        rounds_exceeded: `The demo allows up to ${limits.maxRounds} rounds.`,
      }
      const match = Object.entries(notices).find(([code]) => error.message.includes(code))
      if (match) {
        setNotice(match[1])
        if (match[0] === 'env_closed') setEnvRefreshKey((key) => key + 1)
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
      ? {
          status: 'running',
          stage: activeRun.stage,
          runId: activeRun.id,
          assistantMessageId: activeRun.assistantMessageId,
        }
      : undefined,
  })
  const resumeGuard = useRef(!!activeRun)
  const runActive = run.status === 'queued' || run.status === 'running'
  const followUpMode = run.status === 'done' || (run.status === 'none' && latestRun?.status === 'done')
  const env = useEnvStatus(chatId, {
    seed:
      run.status === 'done' && run.envState
        ? { envState: run.envState, envKeepaliveUntil: run.envKeepaliveUntil ?? null }
        : latestRun && { envState: latestRun.envState, envKeepaliveUntil: latestRun.envKeepaliveUntil },
    refreshKey: envRefreshKey,
  })

  const wasActive = useRef(runActive)
  const lastPoll = useRef(run)

  useEffect(() => {
    followUpRef.current = followUpMode
  }, [followUpMode])

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
    if (status === 'ready' && (run.status === 'done' || run.status === 'failed' || run.status === 'cancelled'))
      setWatching(false)
  }, [run.status, status])

  const errorOf = async (response: Response | null, fallback: string) => {
    const body = (await response?.json().catch(() => null)) as { error?: string } | null
    return body?.error ?? fallback
  }

  const handleStop = async () => {
    if (followUpMode && !runActive) {
      void stop()
      return
    }
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
    run.status === 'failed' ||
    (run.status === 'none' && !!lastMessage?.parts.some((part) => part.type === 'data-error'))

  return (
    <div className="mx-auto flex h-[calc(100dvh-3rem)] w-full max-w-3xl flex-col p-4">
      <NoticeRegion notices={[notice, limits.paused ? 'The demo is paused' : null]}>
        <InterviewSelectionProvider enabled={followUpMode && env.state === 'open'}>
          <Conversation className="min-h-0 flex-1">
            <ConversationContent>
              {messages.map((message) => (
                <Message key={message.id} from={message.role}>
                  <MessageContent>
                    <MessageParts
                      parts={message.parts}
                      onRetry={
                        latestFailed && message === lastMessage && message.role === 'assistant'
                          ? () => void handleRetry()
                          : undefined
                      }
                    />
                  </MessageContent>
                </Message>
              ))}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>
          {followUpMode && <EnvBadge state={env.state} minutesLeft={env.minutesLeft} />}
          {notice && <p className="mt-2 text-sm text-muted-foreground">{notice}</p>}
          {limits.paused && <p className="mt-2 text-sm text-muted-foreground">The demo is paused</p>}
          <Composer
            maxRounds={limits.maxRounds}
            chatId={chatId}
            initialText={initialText}
            mode={followUpMode ? 'followUp' : 'run'}
            envOpen={env.state === 'open'}
            status={status}
            onStop={() => void handleStop()}
            disabled={status === 'submitted' || status === 'streaming' || runActive || (limits.paused && !followUpMode)}
            onSend={async (text, submit) => {
              setNotice(null)
              if (submit.kind === 'followUp') {
                void sendMessage({ text }, { body: { target: submit.target, agentIds: submit.agentIds } })
                return
              }
              const title = chats.find((chat) => chat.id === chatId)?.title
              upsertChat({ id: chatId, runStatus: 'queued', ...(!title && { title: text.slice(0, 60) }) })
              if (initialText) window.history.replaceState(null, '', pathname)
              setSendCount((count) => count + 1)
              setWatching(true)
              void sendMessage({ text }, { body: { uploadIds: submit.uploadIds, runOptions: submit.runOptions } })
            }}
          />
        </InterviewSelectionProvider>
      </NoticeRegion>
    </div>
  )
}
