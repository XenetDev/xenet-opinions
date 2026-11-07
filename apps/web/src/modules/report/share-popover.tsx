'use client'

import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'

const FAILED = {
  create: 'The link could not be created. Try again.',
  revoke: 'The link could not be revoked. Try again.',
}

export function SharePopover({ chatId, messageId }: { chatId: string; messageId?: string }) {
  const id = useId()
  const inputId = `${id}-link`
  const [url, setUrl] = useState<string | null>(null)
  const [pending, setPending] = useState<'create' | 'revoke' | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  const call = async (method: 'POST' | 'DELETE') => {
    const response = await fetch(`/api/chats/${chatId}/run/share`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(messageId ? { messageId } : {}),
    }).catch(() => null)
    const body = (await response?.json().catch(() => null)) as { url?: unknown } | null
    return response?.ok ? (body ?? {}) : null
  }

  const create = async () => {
    setPending('create')
    setStatus(null)
    const body = await call('POST')
    setPending(null)
    if (typeof body?.url === 'string') setUrl(body.url)
    else setStatus(FAILED.create)
  }

  const revoke = async () => {
    setPending('revoke')
    setStatus(null)
    const body = await call('DELETE')
    setPending(null)
    setConfirming(false)
    if (!body) return setStatus(FAILED.revoke)
    setUrl(null)
    setStatus('Link revoked. It no longer opens the report.')
  }

  const copy = async () => {
    if (!url) return
    const done = await navigator.clipboard?.writeText(url).then(
      () => true,
      () => false,
    )
    setStatus(done ? 'Link copied.' : 'Copy the link from the box.')
  }

  return (
    <Popover onOpenChange={() => setConfirming(false)}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline">
          Share
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80" aria-labelledby={`${id}-title`} aria-describedby={`${id}-desc`}>
        <PopoverHeader>
          <PopoverTitle id={`${id}-title`}>Share this report</PopoverTitle>
          <PopoverDescription id={`${id}-desc`} className="text-xs text-pretty">
            Anyone with the link can read the report. The chat, your interviews and files stay private.
          </PopoverDescription>
        </PopoverHeader>
        {url ? (
          <>
            <div className="flex gap-2">
              <label htmlFor={inputId} className="sr-only">
                Share link
              </label>
              <Input id={inputId} readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
              <Button size="sm" onClick={() => void copy()}>
                Copy
              </Button>
            </div>
            {confirming ? (
              <div className="flex flex-wrap items-center gap-2">
                <p className="w-full text-xs text-muted-foreground">Revoke this link? It stops working at once.</p>
                <Button size="sm" variant="destructive" disabled={!!pending} onClick={() => void revoke()}>
                  {pending === 'revoke' ? 'Revoking…' : 'Revoke'}
                </Button>
                <Button size="sm" variant="ghost" disabled={!!pending} onClick={() => setConfirming(false)}>
                  Keep link
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="ghost" className="self-start" onClick={() => setConfirming(true)}>
                Revoke link
              </Button>
            )}
          </>
        ) : (
          <Button size="sm" className="self-start" disabled={!!pending} onClick={() => void create()}>
            {pending === 'create' ? 'Creating link…' : 'Create link'}
          </Button>
        )}
        <p role="status" className="text-xs text-muted-foreground empty:hidden">
          {status}
        </p>
      </PopoverContent>
    </Popover>
  )
}
