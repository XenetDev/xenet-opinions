'use client'

import { type PaidPlanId, PLANS, type PlanId } from '@xo/engine/policy'
import { CheckIcon } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/reui/badge'
import { Button } from '@/components/ui/button'
import { useSignInDialog } from '@/modules/auth/sign-in-dialog'
import { openBillingPortal, startCheckout } from './billing-actions'

const CARDS = ['free', 'starter', 'pro'] as const

const runsLine = (id: (typeof CARDS)[number]) => `${PLANS[id].runs} ${PLANS[id].runs === 1 ? 'run' : 'runs'} a month`

const ENTERPRISE_MAILTO = `mailto:greg@xenet.ai?${new URLSearchParams({
  subject: 'Xenet Opinions Enterprise enquiry',
  body: 'Company:\nParticipants per simulation:\nSimulations per month:\nWhat you want to test:\n',
})
  .toString()
  .replaceAll('+', '%20')}`

export function PricingCards({ plan, subscribed }: { plan: PlanId; subscribed: boolean }) {
  const signInDialog = useSignInDialog()
  const [pending, setPending] = useState<string | null>(null)

  const go = async (key: string, action: () => Promise<boolean>) => {
    setPending(key)
    if (!(await action())) setPending(null)
  }

  const action = (id: (typeof CARDS)[number]) => {
    if (id === plan) {
      return subscribed ? (
        <Button variant="outline" disabled={!!pending} onClick={() => void go('portal', openBillingPortal)}>
          Manage billing
        </Button>
      ) : (
        <Button variant="outline" disabled>
          Current plan
        </Button>
      )
    }
    if (id === 'free') {
      if (plan === 'guest')
        return (
          <Button variant="outline" onClick={signInDialog.open}>
            Sign in free
          </Button>
        )
      return (
        <Button variant="outline" disabled={!!pending} onClick={() => void go('portal', openBillingPortal)}>
          Downgrade
        </Button>
      )
    }
    const paid: PaidPlanId = id
    if (plan === 'guest') return <Button onClick={signInDialog.open}>Sign in to upgrade</Button>
    if (subscribed)
      return (
        <Button
          variant={paid === 'pro' ? 'default' : 'outline'}
          disabled={!!pending}
          onClick={() => void go('portal', openBillingPortal)}
        >
          Switch to {PLANS[paid].name}
        </Button>
      )
    return (
      <Button disabled={!!pending} onClick={() => void go(paid, () => startCheckout(paid))}>
        {pending === paid ? 'Opening…' : `Upgrade to ${PLANS[paid].name}`}
      </Button>
    )
  }

  return (
    <div className="grid w-full gap-4 sm:grid-cols-3">
      {CARDS.map((id) => {
        const current = id === plan || (id === 'free' && plan === 'guest')
        return (
          <section
            key={id}
            aria-labelledby={`plan-${id}`}
            className="flex flex-col gap-4 rounded-xl border bg-card p-5 text-card-foreground"
          >
            <div className="flex min-h-5 items-center justify-between gap-2">
              <h2 id={`plan-${id}`} className="text-sm font-medium">
                {PLANS[id].name}
              </h2>
              {current && (
                <Badge variant="primary-light" size="sm">
                  Current
                </Badge>
              )}
            </div>
            <p className="text-3xl font-semibold tracking-tight tabular-nums">
              ${PLANS[id].priceUsd}
              <span className="text-sm font-normal text-muted-foreground"> /month</span>
            </p>
            <ul className="flex flex-1 flex-col gap-2 text-sm text-muted-foreground">
              {[
                runsLine(id),
                `Up to ${PLANS[id].maxParticipants} participants`,
                `Up to ${PLANS[id].maxRounds} rounds per run`,
                'Reports and persona interviews',
              ].map((line) => (
                <li key={line} className="flex items-start gap-2">
                  <CheckIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  {line}
                </li>
              ))}
            </ul>
            {action(id)}
          </section>
        )
      })}
      <section
        aria-labelledby="plan-enterprise"
        className="flex flex-col gap-4 rounded-xl border bg-card p-5 text-card-foreground sm:col-span-3 sm:flex-row sm:items-center sm:justify-between sm:gap-8"
      >
        <div className="flex flex-col gap-1.5">
          <h2 id="plan-enterprise" className="text-sm font-medium">
            Enterprise
          </h2>
          <p className="text-sm text-pretty text-muted-foreground">
            For organisations that need thousands of participants per simulation, more runs and rounds, and a plan built
            around their research programme. Talk to us about running your focus groups at scale.
          </p>
        </div>
        <Button asChild className="shrink-0 sm:self-center">
          <a href={ENTERPRISE_MAILTO}>Contact us</a>
        </Button>
      </section>
    </div>
  )
}
