import { schema } from '@xo/db'
import { eq } from 'drizzle-orm'
import { env } from '@/env'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/session'
import { billingEnabled, getStripe } from '@/server/billing/stripe'

export const runtime = 'nodejs'

const { subscriptions } = schema

export async function POST(request: Request) {
  if (!billingEnabled()) return Response.json({ error: 'not_found' }, { status: 404 })
  const user = await getSessionUser(request.headers)
  if (!user || user.isAnonymous) return Response.json({ error: 'unauthenticated' }, { status: 401 })
  const [row] = await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id))
  if (!row) return Response.json({ error: 'no_subscription' }, { status: 404 })
  const session = await getStripe().billingPortal.sessions.create({
    customer: row.stripeCustomerId,
    return_url: `${env.NEXT_PUBLIC_APP_URL}/pricing`,
  })
  return Response.json({ url: session.url })
}
