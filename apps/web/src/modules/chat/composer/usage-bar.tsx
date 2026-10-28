'use client'

import { ActivityIcon } from 'lucide-react'
import { FrameHeader } from '@/components/reui/frame'
import { useSignInDialog } from '@/modules/auth/sign-in-dialog'
import type { Usage } from '@/server/usage-from'

const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

export function resetLabel(iso: string, now = new Date()): string {
  const at = new Date(iso)
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((day(at) - day(now)) / 86_400_000)
  const when = days <= 0 ? 'today' : days === 1 ? 'tomorrow' : at.toLocaleDateString([], { weekday: 'long' })
  return `${when} at ${clock(iso)}`
}

export type SignInUpsell = { max: number }

export function UsageBar({ usage, signIn }: { usage: Usage; signIn?: SignInUpsell }) {
  const signInDialog = useSignInDialog()
  const left = Math.max(usage.max - usage.used, 0)
  const summary = `${usage.used} of ${usage.max} runs used today`
  const detail =
    left === 0 && usage.resetAt
      ? `No runs left until ${resetLabel(usage.resetAt)}`
      : usage.resetAt
        ? `Resets ${resetLabel(usage.resetAt)}`
        : null
  return (
    <FrameHeader
      data-testid="usage-bar"
      className="flex-col items-stretch gap-2 rounded-t-[calc(var(--frame-radius)-1px)] bg-muted/40"
    >
      <div className="flex min-w-0 items-center gap-1.5 text-muted-foreground text-xs">
        <ActivityIcon className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">
          <span className="tabular-nums">{summary}</span>
          {detail && (
            <>
              <span
                aria-hidden="true"
                className="mx-1.5 inline-block size-1 rounded-full bg-muted-foreground/40 align-middle"
              />
              <span suppressHydrationWarning>{detail}</span>
            </>
          )}
          {signIn && (
            <>
              <span
                aria-hidden="true"
                className="mx-1.5 inline-block size-1 rounded-full bg-muted-foreground/40 align-middle"
              />
              <button
                type="button"
                className="cursor-pointer text-xs underline-offset-2 hover:underline"
                onClick={signInDialog.open}
              >
                Sign in for {signIn.max} runs a day
              </button>
            </>
          )}
        </span>
      </div>
    </FrameHeader>
  )
}
