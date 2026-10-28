'use client'

import { useChat } from '@ai-sdk/react'
import type { OpinionsUIMessage, Stage } from '@xo/engine/parts'
import { generateId } from 'ai'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useChatList } from '@/modules/chat/chat-list-context'
import type { Limits } from '@/server/limits'
import type { Usage } from '@/server/usage-from'
import { useChatActivity } from './chat-activity'
import { Composer } from './composer/composer'
import type { SignInUpsell } from './composer/usage-bar'
import { liveStepLabel, STAGE_TITLES } from './console/derive'
import { type RecentChat, Welcome } from './home/welcome'
import { InterviewSelectionProvider } from './interview-selection'
import { MessageParts } from './message-parts'
import { NoticeRegion } from './notice-region'
import { runTransport } from './run-transport'
import { SEND_FAILED, sendNotices } from './send-notices'
import { Thread } from './thread/thread'
import { messageText } from './thread/turn'
import { useRunStatus } from './use-run-status'

const CANCEL_NOTICES: Record<string, string> = {
  run_not_active: 'The run has already finished',
  not_found: 'There is no run to cancel yet',
}

const INTERVIEW_NOTICES: Record<string, string> = {
  window_closed: 'The interview window has closed. The report is being generated.',
  report_requested: 'The report is being generated; no more interviews for this run.',
  run_paused: 'Pick personas to interview, or generate the report.',
}

type LatestRun = {
  id: string
  status: string
  assistantMessageId: string
  envState: 'none' | 'open' | 'closed'
  envKeepaliveUntil: string | null
}

const isRunFailure = (messages: OpinionsUIMessage[], text: string) =>
  !!messages
    .findLast((message) => message.role === 'assistant')
    ?.parts.some(
      (part) =>
        (part.type === 'data-stage' && part.data.status === 'failed' && part.data.message === text) ||
        (part.type === 'data-error' && part.data.message === text),
    )

export function Chat({
  mode = 'existing',
  recent = [],
  chatId,
  initialMessages,
  activeRun,
  latestRun,
  limits,
  startedAt,
  usage: initialUsage = null,
  signIn,
}: {
  mode?: 'new' | 'existing'
  recent?: RecentChat[]
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
  limits: Limits
  usage?: Usage | null
  signIn?: SignInUpsell
  startedAt?: string
}) {
  const router = useRouter()
  const { chats, upsertChat } = useChatList()
  const { setActivity } = useChatActivity()
  const runActiveRef = useRef(!!activeRun)
  const runFailedRef = useRef(false)
  const runIdAtSendRef = useRef<string | undefined>(undefined)
  const messagesRef = useRef(initialMessages)
  const [notice, setNotice] = useState<string | null>(null)
  const [usage, setUsage] = useState(initialUsage)
  const [watching, setWatching] = useState(!!activeRun)
  const [sendCount, setSendCount] = useState(0)
  const [draft, setDraft] = useState('')
  const composerRef = useRef<HTMLDivElement>(null)
  const committedRef = useRef(mode === 'existing')
  const firstSend = useRef<{ resolve: () => void; reject: (error: Error) => void } | null>(null)
  const replayFirstResume = useRef(!!activeRun).current
  const transport = useMemo(() => {
    const base = runTransport(chatId, { replayFirstResume })
    return {
      ...base,
      sendMessages: async (options: Parameters<typeof base.sendMessages>[0]) => {
        const stream = await base.sendMessages(options)
        firstSend.current?.resolve()
        firstSend.current = null
        return stream
      },
    }
  }, [chatId, replayFirstResume])
  const { messages, sendMessage, setMessages, status, stop, resumeStream } = useChat<OpinionsUIMessage>({
    id: chatId,
    onError: (error) => {
      firstSend.current?.reject(error)
      firstSend.current = null
      const match = Object.entries(sendNotices(limits, !!signIn)).find(([code]) => error.message.includes(code))
      if (match) setNotice(match[1])
      else if (!runActiveRef.current && !runFailedRef.current && !isRunFailure(messagesRef.current, error.message))
        setNotice(SEND_FAILED)
    },
    messages: initialMessages,
    resume: !!activeRun,
    transport,
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
  messagesRef.current = messages
  runFailedRef.current = run.status === 'failed' && (sendCount === 0 || run.runId !== runIdAtSendRef.current)
  const resumeGuard = useRef(!!activeRun)
  const runActive = run.status === 'queued' || run.status === 'running'
  const followUpMode = run.status === 'done' || (run.status === 'none' && latestRun?.status === 'done')
  const interviewMode = run.status === 'running' && run.stage === 'interviews' && !run.reportRequested

  const wasActive = useRef(runActive)
  const lastPoll = useRef(run)

  const statusRef = useRef(status)

  useEffect(() => {
    statusRef.current = status
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
    if (statusRef.current !== 'streaming' && statusRef.current !== 'submitted') void resumeStream()
  }

  const handleRetry = async () => {
    setNotice(null)
    const response = await fetch(`/api/chats/${chatId}/run/retry`, { method: 'POST' }).catch(() => null)
    if (response?.status === 201) router.refresh()
    else setNotice(await errorOf(response, 'Something went wrong retrying the run'))
  }

  const lastMessage = messages.at(-1)
  const runMessage = runActive
    ? (messages.find((message) => message.id === run.assistantMessageId) ??
      messages.findLast((message) => message.role === 'assistant'))
    : undefined
  const step = runActive
    ? ((runMessage && liveStepLabel(runMessage.parts)) ?? (run.stage && STAGE_TITLES[run.stage]))
    : undefined

  useEffect(() => {
    setActivity({ chatId, running: runActive, ...(step && { step }) })
  }, [chatId, runActive, step, setActivity])

  useEffect(() => () => setActivity((current) => (current?.chatId === chatId ? null : current)), [chatId, setActivity])

  const latestFailed =
    run.status === 'failed' ||
    (run.status === 'none' && !!lastMessage?.parts.some((part) => part.type === 'data-error'))

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <NoticeRegion notices={[notice, limits.paused ? 'The demo is paused' : null]}>
        <InterviewSelectionProvider enabled={interviewMode}>
          {mode === 'new' && messages.length === 0 ? (
            <Welcome
              recent={recent}
              onUseStarter={(prompt) => {
                setDraft(prompt)
                composerRef.current?.querySelector('textarea')?.focus()
              }}
            />
          ) : (
            <Thread
              className="min-h-0 flex-1"
              messages={messages}
              startedAt={startedAt}
              renderAssistant={(message) => {
                const question = messages.slice(0, messages.indexOf(message)).findLast((m) => m.role === 'user')
                const asked = question && messageText(question)
                return (
                  <MessageParts
                    parts={message.parts}
                    chatId={chatId}
                    title={asked && (asked.length > 60 ? `${asked.slice(0, 60).trimEnd()}…` : asked)}
                    windowUntil={run.stage === 'interviews' ? run.envKeepaliveUntil : undefined}
                    reportRequested={run.stage === 'interviews' && run.reportRequested}
                    windowLive={runActive && message.id === run.assistantMessageId}
                    onCancelRun={interviewMode ? () => void handleStop() : undefined}
                    onRetry={latestFailed && message === lastMessage ? () => void handleRetry() : undefined}
                  />
                )
              }}
            />
          )}
          <div ref={composerRef} className="mx-auto w-full max-w-3xl px-4 pb-4">
            {notice && <p className="mt-2 text-sm text-muted-foreground">{notice}</p>}
            {limits.paused && <p className="mt-2 text-sm text-muted-foreground">The demo is paused</p>}
            <Composer
              maxRounds={limits.maxRounds}
              chatId={chatId}
              allowPause={limits.allowPause}
              usage={usage}
              {...(signIn ? { signIn } : {})}
              {...(mode === 'new' && { value: draft, onValueChange: setDraft })}
              mode={interviewMode ? 'interview' : followUpMode ? 'followUp' : 'run'}
              status={interviewMode ? undefined : status}
              busy={runActive && !interviewMode}
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
                if (!committedRef.current) {
                  const started = new Promise<void>((resolve, reject) => {
                    firstSend.current = { resolve, reject }
                  })
                  void sendMessage(
                    { text },
                    { body: { uploadIds: submit.uploadIds, runOptions: submit.runOptions } },
                  ).then(() => {
                    firstSend.current?.resolve()
                    firstSend.current = null
                  })
                  try {
                    await started
                  } catch (error) {
                    setMessages([])
                    throw error
                  }
                  committedRef.current = true
                  window.history.pushState(null, '', `/c/${chatId}`)
                  setUsage((current) => current && { ...current, used: Math.min(current.used + 1, current.max) })
                  upsertChat({ id: chatId, title: text.slice(0, 60), runStatus: 'queued' })
                  setSendCount((count) => count + 1)
                  setWatching(true)
                  return
                }
                setUsage((current) => current && { ...current, used: Math.min(current.used + 1, current.max) })
                const title = chats.find((chat) => chat.id === chatId)?.title
                upsertChat({ id: chatId, runStatus: 'queued', ...(!title && { title: text.slice(0, 60) }) })
                runIdAtSendRef.current = run.runId
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
