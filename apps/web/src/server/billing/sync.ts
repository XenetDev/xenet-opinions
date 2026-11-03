import { schema } from '@xo/db'
import { planFromLookupKey } from '@xo/engine/policy'
import { eq } from 'drizzle-orm'
import type Stripe from 'stripe'
import { db } from '@/lib/db'
import { getStripe } from './stripe'

const { subscriptions, user } = schema

export const isPaidStatus = (status: string | null | undefined) =>
  status === 'active' || status === 'trialing' || status === 'past_due'

const customerIdOf = (sub: Stripe.Subscription) => (typeof sub.customer === 'string' ? sub.customer : sub.customer.id)

export async function syncSubscription(subscriptionId: string, stripe: Stripe = getStripe()): Promise<void> {
  const sub = await stripe.subscriptions.retrieve(subscriptionId)
  const customerId = customerIdOf(sub)
  const [byCustomer] = await db.select().from(subscriptions).where(eq(subscriptions.stripeCustomerId, customerId))
  const userId = byCustomer?.userId ?? sub.metadata.user_id
  if (!userId) throw new Error(`subscription_without_user:${sub.id}`)
  const [owner] = await db.select({ id: user.id }).from(user).where(eq(user.id, userId))
  if (!owner) return

  const [current] = byCustomer
    ? [byCustomer]
    : await db.select().from(subscriptions).where(eq(subscriptions.userId, userId))
  const otherId =
    current?.stripeSubscriptionId && current.stripeSubscriptionId !== sub.id && current.stripeSubscriptionId
  if (otherId && isPaidStatus(current?.status)) {
    if (!isPaidStatus(sub.status)) return
    const other = await stripe.subscriptions.retrieve(otherId)
    if (isPaidStatus(other.status)) {
      console.error('duplicate subscription cancelled', { userId, kept: otherId, cancelled: sub.id })
      await stripe.subscriptions.cancel(sub.id, { prorate: true, invoice_now: true })
      return
    }
  }

  const item = sub.items.data[0]
  const plan = planFromLookupKey(item?.price.lookup_key)
  if (!item || !plan) throw new Error(`subscription_unknown_price:${sub.id}`)
  const values = {
    stripeCustomerId: customerId,
    stripeSubscriptionId: sub.id,
    plan,
    status: sub.status,
    currentPeriodStart: new Date(item.current_period_start * 1000),
    currentPeriodEnd: new Date(item.current_period_end * 1000),
    cancelAtPeriodEnd: sub.cancel_at_period_end || sub.cancel_at !== null,
    updatedAt: new Date(),
  }
  await db
    .insert(subscriptions)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: subscriptions.userId, set: values })
}

export async function syncCheckoutSession(sessionId: string, userId: string, stripe: Stripe = getStripe()) {
  const session = await stripe.checkout.sessions.retrieve(sessionId)
  if (session.client_reference_id !== userId || !session.subscription) return
  await syncSubscription(
    typeof session.subscription === 'string' ? session.subscription : session.subscription.id,
    stripe,
  )
}

export async function cancelUserSubscription(userId: string, stripe?: Stripe): Promise<void> {
  const [row] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId))
  if (!row?.stripeSubscriptionId || !isPaidStatus(row.status)) return
  await (stripe ?? getStripe()).subscriptions.cancel(row.stripeSubscriptionId)
}
