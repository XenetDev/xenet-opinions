'use client'

import { PLANS } from '@xo/engine/policy'
import Link from 'next/link'
import { Progress } from '@/components/ui/progress'
import { useSignInDialog } from '@/modules/auth/sign-in-dialog'
import { useUsage } from './usage-context'

const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

export function resetLabel(iso: string, now = new Date()): string {
  const at = new Date(iso)
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((day(at) - day(now)) / 86_400_000)
  const when = days <= 0 ? 'today' : days === 1 ? 'tomorrow' : at.toLocaleDateString([], { weekday: 'long' })
  return `${when} at ${clock(iso)}`
}

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', timeZone: 'UTC' })

function PlanUsageCard() {
  const { usage, signIn } = useUsage()
  const signInDialog = useSignInDialog()
  if (!usage?.plan) return null
  const { plan, used, max, resetAt, subscribed, cancelAtPeriodEnd } = usage
  const renewal = subscribed ? 'Renews' : 'Resets'
  const left = Math.max(max - used, 0)
  const detail = !resetAt
    ? left === 0
      ? 'No runs left'
      : null
    : cancelAtPeriodEnd
      ? `Cancels ${shortDate(resetAt)}`
      : `${left === 0 ? `No runs left. ${renewal}` : renewal} ${shortDate(resetAt)}`
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-3 text-xs">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium">{PLANS[plan].name}</span>
        <span className="text-muted-foreground tabular-nums">
          {used} of {max} runs
        </span>
      </div>
      <Progress value={max > 0 ? used : 0} max={max > 0 ? max : 1} aria-label="Runs used" />
      {detail && (
        <p className="text-muted-foreground" suppressHydrationWarning>
          {detail}
        </p>
      )}
      {signIn ? (
        <button
          type="button"
          className="cursor-pointer self-start text-muted-foreground underline-offset-2 hover:underline"
          onClick={signInDialog.open}
        >
          Sign in for {signIn.max} runs a month
        </button>
      ) : (
        plan !== 'pro' && (
          <Link href="/pricing" className="self-start font-medium underline-offset-2 hover:underline">
            Upgrade
          </Link>
        )
      )}
    </div>
  )
}

export function UsageCard() {
  const { usage, signIn } = useUsage()
  const signInDialog = useSignInDialog()
  if (!usage) return null
  if (usage.plan) return <PlanUsageCard />
  const left = Math.max(usage.max - usage.used, 0)
  const detail =
    left === 0 && usage.resetAt
      ? `No runs left until ${resetLabel(usage.resetAt)}`
      : usage.resetAt
        ? `Resets ${resetLabel(usage.resetAt)}`
        : null
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-3 text-xs">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium">Runs today</span>
        <span className="text-muted-foreground tabular-nums">
          {usage.used} of {usage.max}
        </span>
      </div>
      <Progress
        value={usage.max > 0 ? usage.used : 0}
        max={usage.max > 0 ? usage.max : 1}
        aria-label="Runs used today"
      />
      {detail && (
        <p className="text-muted-foreground" suppressHydrationWarning>
          {detail}
        </p>
      )}
      {signIn && (
        <button
          type="button"
          className="cursor-pointer self-start text-muted-foreground underline-offset-2 hover:underline"
          onClick={signInDialog.open}
        >
          Sign in for {signIn.max} runs a day
        </button>
      )}
    </div>
  )
}
