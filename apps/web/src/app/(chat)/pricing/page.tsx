import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/session'
import { PricingCards } from '@/modules/billing/pricing-cards'
import { resolveLimits } from '@/server/billing/limits'
import { billingEnabled } from '@/server/billing/stripe'
import { syncCheckoutSession } from '@/server/billing/sync'

export const metadata = { title: 'Plans' }

export default async function PricingPage({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  if (!billingEnabled()) notFound()
  const user = await getSessionUser(await headers())
  const { session_id: sessionId } = await searchParams
  if (sessionId && user) {
    await syncCheckoutSession(sessionId, user.id).catch((error) => {
      console.error('checkout return sync failed', { error })
    })
    redirect('/pricing')
  }
  const { allowance } = await resolveLimits(user)

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-semibold tracking-tight">Plans</h2>
          <p className="text-sm text-muted-foreground">
            A run simulates how people react to your decision and writes the report. Retrying a failed run is always
            free.
          </p>
        </div>
        <PricingCards plan={allowance?.plan ?? 'guest'} subscribed={allowance?.subscribed ?? false} />
        <p className="text-xs text-muted-foreground">
          Billed monthly in USD. Cancel any time from Manage billing; your plan stays active until the period ends.
        </p>
      </div>
    </div>
  )
}
