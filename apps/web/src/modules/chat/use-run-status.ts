'use client'

import type { Stage } from '@xo/engine/parts'
import { useEffect, useRef, useState } from 'react'
import { useChatList } from '@/modules/sidebar/chat-list-context'

export type RunStatus = 'none' | 'queued' | 'running' | 'done' | 'failed' | 'cancelled'
export type RunStatusState = {
  status: RunStatus
  stage?: Stage
  runId?: string
  assistantMessageId?: string
  envState?: 'none' | 'open' | 'closed'
  envKeepaliveUntil?: string | null
}

const MAX_STALE_POLLS = 6

const isActive = (status: RunStatus) => status === 'queued' || status === 'running'

export function useRunStatus(
  chatId: string,
  opts: { enabled: boolean; intervalMs?: number; sendCount?: number; initial?: RunStatusState; fetch?: typeof fetch },
): RunStatusState {
  const { enabled, intervalMs = 5000, sendCount = 0 } = opts
  const fetchRef = useRef(opts.fetch)
  const initialRef = useRef(opts.initial)
  const [state, setState] = useState<RunStatusState>(opts.initial ?? { status: 'none' })
  const { upsertChat } = useChatList()
  const upsertRef = useRef(upsertChat)

  useEffect(() => {
    fetchRef.current = opts.fetch
    upsertRef.current = upsertChat
  })

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const controller = new AbortController()
    let polls = 0
    let baseline: string | null | undefined
    let sawActive = sendCount === 0 && !!initialRef.current && isActive(initialRef.current.status)

    async function poll() {
      let next: RunStatusState | null = null
      try {
        const response = await (fetchRef.current ?? fetch)(`/api/chats/${chatId}/run`, { signal: controller.signal })
        if (response.ok) next = (await response.json()) as RunStatusState
      } catch {
        next = null
      }
      if (cancelled) return
      if (next) {
        const exposed: RunStatusState = {
          status: next.status,
          stage: next.stage,
          runId: next.runId,
          assistantMessageId: next.assistantMessageId,
          envState: next.envState,
          envKeepaliveUntil: next.envKeepaliveUntil,
        }
        polls++
        if (baseline === undefined)
          baseline = next.status === 'none' || isActive(next.status) ? null : (next.runId ?? null)
        if (isActive(next.status)) {
          sawActive = true
          setState(exposed)
        } else if (sawActive || (next.status !== 'none' && next.runId !== baseline)) {
          setState(exposed)
          if (next.status !== 'none') upsertRef.current({ id: chatId, runStatus: next.status })
          return
        } else if (polls >= MAX_STALE_POLLS) {
          setState(exposed)
          return
        }
      }
      timer = setTimeout(poll, intervalMs)
    }

    void poll()
    return () => {
      cancelled = true
      controller.abort()
      if (timer) clearTimeout(timer)
    }
  }, [chatId, enabled, intervalMs, sendCount])

  return state
}
