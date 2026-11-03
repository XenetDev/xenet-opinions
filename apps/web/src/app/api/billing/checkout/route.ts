import { schema } from '@xo/db'
import { isPaidPlan, PLANS } from '@xo/engine/policy'
import { eq } from 'drizzle-orm'
import { env } from '@/env'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/session'
import { billingEnabled, getStripe } from '@/server/billing/stripe'
import { expireOpenCheckouts, isPaidStatus } from '@/server/billing/sync'

export const runtime = 'nodejs'

const { subscriptions } = schema

export async function POST(request: Request) {
  if (!billingEnabled()) return Response.json({ error: 'not_found' }, { status: 404 })
  const user = await getSessionUser(request.headers)
  if (!user || user.isAnonymous) return Response.json({ error: 'unauthenticated' }, { status: 401 })
  const body = (await request.json().catch(() => null)) as { plan?: unknown } | null
  if (!isPaidPlan(body?.plan)) return Response.json({ error: 'invalid_body' }, { status: 400 })
  const plan = body.plan

  const [row] = await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id))
  if (row && isPaidStatus(row.status)) return Response.json({ error: 'already_subscribed' }, { status: 409 })

  const stripe = getStripe()
  let customerId = row?.stripeCustomerId
  if (!customerId) {
    const customer = await stripe.customers.create(
      { email: user.email, metadata: { user_id: user.id } },
      { idempotencyKey: `customer-${user.id}` },
    )
    customerId = customer.id
    await db
      .insert(subscriptions)
      .values({ userId: user.id, stripeCustomerId: customerId })
      .onConflictDoNothing({ target: subscriptions.userId })
  }

  await expireOpenCheckouts(customerId, stripe)
  const { data: prices } = await stripe.prices.list({ lookup_keys: [PLANS[plan].lookupKey], active: true, limit: 1 })
  const price = prices[0]
  if (!price) return Response.json({ error: 'price_not_found' }, { status: 500 })

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    client_reference_id: user.id,
    line_items: [{ price: price.id, quantity: 1 }],
    subscription_data: { metadata: { user_id: user.id } },
    success_url: `${env.NEXT_PUBLIC_APP_URL}/pricing?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.NEXT_PUBLIC_APP_URL}/pricing`,
  })
  return Response.json({ url: session.url })
}
