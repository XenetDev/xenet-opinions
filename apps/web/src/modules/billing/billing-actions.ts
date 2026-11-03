import type { PaidPlanId } from '@xo/engine/policy'
import { toast } from 'sonner'

async function redirectTo(path: string, init: RequestInit): Promise<boolean> {
  const response = await fetch(path, { method: 'POST', ...init }).catch(() => null)
  const data = response?.ok ? ((await response.json().catch(() => null)) as { url?: string } | null) : null
  if (!data?.url) {
    toast.error('Could not open billing. Try again.')
    return false
  }
  window.location.assign(data.url)
  return true
}

export const openBillingPortal = () => redirectTo('/api/billing/portal', {})

export const startCheckout = (plan: PaidPlanId) =>
  redirectTo('/api/billing/checkout', {
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ plan }),
  })
