'use client'

import { generateId } from 'ai'
import { useRouter } from 'next/navigation'
import { useCallback, useRef, useState } from 'react'
import { useChatList } from '@/modules/sidebar/chat-list-context'
import type { Limits } from '@/server/limits'
import { Composer } from '../composer/composer'
import { NoticeRegion } from '../notice-region'
import { SEND_FAILED, sendNotices } from '../send-notices'
import { type RecentChat, Welcome } from './welcome'

export function HomeChat({ recent, limits }: { recent: RecentChat[]; limits: Limits }) {
  const router = useRouter()
  const { upsertChat } = useChatList()
  const [draft, setDraft] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const pendingChat = useRef<Promise<string> | null>(null)
  const composer = useRef<HTMLDivElement>(null)

  const ensureChat = useCallback(() => {
    pendingChat.current ??= fetch('/api/chats', { method: 'POST' })
      .then(async (response) => {
        if (!response.ok) throw new Error('create_failed')
        return ((await response.json()) as { id: string }).id
      })
      .catch((error: unknown) => {
        pendingChat.current = null
        throw error
      })
    return pendingChat.current
  }, [])

  return (
    <div className="flex h-[calc(100dvh-3rem)] w-full flex-col">
      <NoticeRegion notices={[notice, limits.paused ? 'The demo is paused' : null]}>
        <Welcome
          recent={recent}
          onUseStarter={(prompt) => {
            setDraft(prompt)
            composer.current?.querySelector('textarea')?.focus()
          }}
        />
        <div ref={composer} className="mx-auto w-full max-w-3xl px-4 pb-4">
          {notice && <p className="mt-2 text-sm text-muted-foreground">{notice}</p>}
          {limits.paused && <p className="mt-2 text-sm text-muted-foreground">The demo is paused</p>}
          <Composer
            mode="run"
            value={draft}
            onValueChange={setDraft}
            onNeedChat={ensureChat}
            maxRounds={limits.maxRounds}
            allowPause={limits.allowPause}
            disabled={limits.paused}
            onSend={async (text, submit) => {
              if (submit.kind !== 'run') return
              setNotice(null)
              const id = await ensureChat().catch(() => null)
              const response = id
                ? await fetch(`/api/chats/${id}/messages`, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({
                      id,
                      message: { id: generateId(), role: 'user', parts: [{ type: 'text', text }] },
                      uploadIds: submit.uploadIds,
                      runOptions: submit.runOptions,
                    }),
                  }).catch(() => null)
                : null
              if (!id || !response?.ok) {
                const body = (await response?.json().catch(() => null)) as { error?: string } | null
                const code = body?.error ?? 'send_failed'
                setNotice(sendNotices(limits)[code] ?? SEND_FAILED)
                throw new Error(code)
              }
              upsertChat({ id, title: text.slice(0, 60), runStatus: 'queued' })
              router.push(`/c/${id}`)
              router.refresh()
            }}
          />
        </div>
      </NoticeRegion>
    </div>
  )
}
