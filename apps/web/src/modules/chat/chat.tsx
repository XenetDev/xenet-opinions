'use client'

import { useChat } from '@ai-sdk/react'
import type { OpinionsUIMessage, Stage } from '@xo/engine/parts'
import { DefaultChatTransport, generateId } from 'ai'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { useChatList } from '@/modules/sidebar/chat-list-context'
import type { Limits } from '@/server/limits'
import { Composer } from './composer/composer'
import { InterviewSelectionProvider } from './interview-selection'
import { MessageParts } from './message-parts'
import { NoticeRegion } from './notice-region'
import { Thread } from './thread/thread'
import { messageText } from './thread/turn'
import { useRunStatus } from './use-run-status'

const CANCEL_NOTICES: Record<string, string> = {
  run_not_active: 'The run has already finished',
  not_found: 'There is no run to cancel yet',
}

const SEND_NOTICES: Record<string, string> = {
  run_active: 'A run is already in progress for this chat.',
  follow_up_failed: 'The report agent did not answer. Try again.',
  follow_up_unavailable: 'Follow-ups are not available for this run.',
  demo_paused: 'The demo is paused right now. Try again later.',
}

const INTERVIEW_NOTICES: Record<string, string> = {
  window_closed: 'The interview window has closed. The report is being generated.',
  report_requested: 'The report is being generated; no more interviews for this run.',
  run_paused: 'Pick personas to interview, or generate the report.',
}

const SEND_FAILED = 'Something went wrong sending your message'

const quotaNotice = (runs: number) =>
  `You've used today's ${runs === 1 ? '' : `${runs === 2 ? 'two' : runs} `}run${runs === 1 ? '' : 's'}. Come back tomorrow.`

type LatestRun = {
  id: string
  status: string
  assistantMessageId: string
  envState: 'none' | 'open' | 'closed'
  envKeepaliveUntil: string | null
}

export function Chat({
  chatId,
  initialMessages,
  activeRun,
  latestRun,
  initialText,
  limits,
  startedAt,
}: {
  chatId: string
  initialMessages: OpinionsUIMessage[]
  activeRun: {
    id: string
    assistantMessageId: string
    stage: Stage
    reportRequested?: boolean
    envKeepaliveUntil?: string | null
  } | null
  latestRun: LatestRun | null
  initialText?: string
  limits: Limits
  startedAt?: string
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
      const notices: Record<string, string> = {
        ...SEND_NOTICES,
        quota_exceeded: quotaNotice(limits.maxRunsPerDay),
        rounds_exceeded: `The demo allows up to ${limits.maxRounds} rounds.`,
      }
      const match = Object.entries(notices).find(([code]) => error.message.includes(code))
      if (match) setNotice(match[1])
      else if (!runActiveRef.current) setNotice(SEND_FAILED)
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
          reportRequested: activeRun.reportRequested,
          envKeepaliveUntil: activeRun.envKeepaliveUntil,
        }
      : undefined,
  })
  const resumeGuard = useRef(!!activeRun)
  const runActive = run.status === 'queued' || run.status === 'running'
  const followUpMode = run.status === 'done' || (run.status === 'none' && latestRun?.status === 'done')
  const interviewMode = run.status === 'running' && run.stage === 'interviews' && !run.reportRequested

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

  const sendInterview = async (text: string, agentIds: string[]) => {
    const response = await fetch(`/api/chats/${chatId}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: chatId,
        message: { id: generateId(), role: 'user', parts: [{ type: 'text', text }] },
        target: 'agents',
        agentIds,
      }),
    }).catch(() => null)
    if (!response?.ok) {
      const code = await errorOf(response, 'send_failed')
      setNotice(INTERVIEW_NOTICES[code] ?? SEND_FAILED)
      throw new Error(code)
    }
    void resumeStream()
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

  const sourcesPart = messages.flatMap((message) => message.parts).findLast((part) => part.type === 'data-sources')
  const sources = sourcesPart?.type === 'data-sources' ? sourcesPart.data : undefined

  return (
    <div className="flex h-[calc(100dvh-3rem)] w-full flex-col">
      <NoticeRegion notices={[notice, limits.paused ? 'The demo is paused' : null]}>
        <InterviewSelectionProvider enabled={interviewMode}>
          <Thread
            className="min-h-0 flex-1"
            messages={messages}
            sources={sources}
            startedAt={startedAt}
            renderAssistant={(message) => {
              const question = messages.slice(0, messages.indexOf(message)).findLast((m) => m.role === 'user')
              return (
                <MessageParts
                  parts={message.parts}
                  chatId={chatId}
                  title={question && messageText(question).slice(0, 60).trimEnd()}
                  windowUntil={run.stage === 'interviews' ? run.envKeepaliveUntil : undefined}
                  reportRequested={run.stage === 'interviews' && run.reportRequested}
                  windowLive={runActive && message.id === run.assistantMessageId}
                  onCancelRun={interviewMode ? () => void handleStop() : undefined}
                  onRetry={latestFailed && message === lastMessage ? () => void handleRetry() : undefined}
                />
              )
            }}
          />
          <div className="mx-auto w-full max-w-3xl px-4 pb-4">
            {notice && <p className="mt-2 text-sm text-muted-foreground">{notice}</p>}
            {limits.paused && <p className="mt-2 text-sm text-muted-foreground">The demo is paused</p>}
            <Composer
              maxRounds={limits.maxRounds}
              chatId={chatId}
              initialText={initialText}
              allowPause={limits.allowPause}
              mode={interviewMode ? 'interview' : followUpMode ? 'followUp' : 'run'}
              status={interviewMode ? undefined : status}
              onStop={() => void handleStop()}
              disabled={
                !interviewMode &&
                (status === 'submitted' || status === 'streaming' || runActive || (limits.paused && !followUpMode))
              }
              onSend={async (text, submit) => {
                setNotice(null)
                if (submit.kind === 'followUp' && submit.target === 'agents') {
                  await sendInterview(text, submit.agentIds)
                  return
                }
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
          </div>
        </InterviewSelectionProvider>
      </NoticeRegion>
    </div>
  )
}
