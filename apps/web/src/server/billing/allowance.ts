import { type Subscription, schema } from '@xo/db'
import { isPaidPlan, PLANS, type PlanId, startOfNextUtcMonth, startOfUtcMonth } from '@xo/engine/policy'
import { and, count, eq, gte } from 'drizzle-orm'
import { db } from '@/lib/db'
import { isPaidStatus, syncSubscription } from './sync'

const { runUsage, subscriptions } = schema

export type Allowance = {
  plan: PlanId
  used: number
  max: number
  maxRounds: number
  since: string | null
  resetAt: string | null
  subscribed: boolean
  cancelAtPeriodEnd: boolean
}

type Resolved = {
  plan: PlanId
  since: Date | null
  resetAt: Date | null
  subscribed: boolean
  cancelAtPeriodEnd: boolean
}

export function resolvePlan(
  user: { isAnonymous: boolean },
  row:
    | Pick<Subscription, 'plan' | 'status' | 'currentPeriodStart' | 'currentPeriodEnd' | 'cancelAtPeriodEnd'>
    | undefined,
  now: Date,
): Resolved {
  if (user.isAnonymous)
    return { plan: 'guest', since: null, resetAt: null, subscribed: false, cancelAtPeriodEnd: false }
  if (row && isPaidStatus(row.status) && isPaidPlan(row.plan) && row.currentPeriodStart && row.currentPeriodEnd) {
    return {
      plan: row.plan,
      since: row.currentPeriodStart,
      resetAt: row.currentPeriodEnd,
      subscribed: true,
      cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    }
  }
  return {
    plan: 'free',
    since: startOfUtcMonth(now),
    resetAt: startOfNextUtcMonth(now),
    subscribed: false,
    cancelAtPeriodEnd: false,
  }
}

const needsResync = (row: Subscription | undefined, now: Date) =>
  !!row?.stripeSubscriptionId && isPaidStatus(row.status) && !!row.currentPeriodEnd && row.currentPeriodEnd <= now

async function readSubscription(userId: string, now: Date): Promise<Subscription | undefined> {
  const read = async () => (await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)))[0]
  const row = await read()
  if (!needsResync(row, now)) return row
  try {
    await syncSubscription(row!.stripeSubscriptionId!)
  } catch (error) {
    console.error('subscription resync failed', { userId, error })
    return row
  }
  return read()
}

export async function getAllowance(user: { id: string; isAnonymous: boolean }, now = new Date()): Promise<Allowance> {
  const row = user.isAnonymous ? undefined : await readSubscription(user.id, now)
  const resolved = resolvePlan(user, row, now)
  const [usage] = await db
    .select({ n: count() })
    .from(runUsage)
    .where(and(eq(runUsage.userId, user.id), ...(resolved.since ? [gte(runUsage.createdAt, resolved.since)] : [])))
  const plan = PLANS[resolved.plan]
  return {
    plan: resolved.plan,
    used: usage?.n ?? 0,
    max: plan.runs,
    maxRounds: plan.maxRounds,
    since: resolved.since?.toISOString() ?? null,
    resetAt: resolved.resetAt?.toISOString() ?? null,
    subscribed: resolved.subscribed,
    cancelAtPeriodEnd: resolved.cancelAtPeriodEnd,
  }
}

export const guestAllowance = (): Allowance => ({
  plan: 'guest',
  used: 0,
  max: PLANS.guest.runs,
  maxRounds: PLANS.guest.maxRounds,
  since: null,
  resetAt: null,
  subscribed: false,
  cancelAtPeriodEnd: false,
})
