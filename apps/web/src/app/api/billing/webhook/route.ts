import type Stripe from 'stripe'
import { env } from '@/env'
import { billingEnabled, getStripe } from '@/server/billing/stripe'
import { syncSubscription } from '@/server/billing/sync'

export const runtime = 'nodejs'

const subscriptionIdOf = (event: Stripe.Event): string | null => {
  switch (event.type) {
    case 'checkout.session.completed': {
      const { subscription } = event.data.object
      return typeof subscription === 'string' ? subscription : (subscription?.id ?? null)
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      return event.data.object.id
    default:
      return null
  }
}

export async function POST(request: Request) {
  if (!billingEnabled() || !env.STRIPE_WEBHOOK_SECRET) return Response.json({ error: 'not_found' }, { status: 404 })
  const signature = request.headers.get('stripe-signature')
  if (!signature) return Response.json({ error: 'invalid_signature' }, { status: 400 })
  const stripe = getStripe()
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(await request.text(), signature, env.STRIPE_WEBHOOK_SECRET)
  } catch {
    return Response.json({ error: 'invalid_signature' }, { status: 400 })
  }
  const subscriptionId = subscriptionIdOf(event)
  if (subscriptionId) await syncSubscription(subscriptionId, stripe)
  return Response.json({ received: true })
}
