import { schema } from '@xo/db'
import { eq } from 'drizzle-orm'
import type Stripe from 'stripe'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/env', () => ({ env: { DATABASE_URL: process.env.DATABASE_URL } }))

const { runUsage, subscriptions, user } = schema
const USER = `billing-sync-${Date.now()}`
const CUSTOMER = `cus_${USER}`

type Sub = Partial<Stripe.Subscription> & { id: string }

const sub = (id: string, status: string, lookupKey = 'starter_monthly', start = 1_800_000_000): Sub =>
  ({
    id,
    status,
    customer: CUSTOMER,
    metadata: { user_id: USER },
    cancel_at_period_end: false,
    cancel_at: null,
    items: {
      data: [{ current_period_start: start, current_period_end: start + 2_592_000, price: { lookup_key: lookupKey } }],
    },
  }) as unknown as Sub

function fakeStripe(subs: Sub[]) {
  const cancel = vi.fn(async () => ({}))
  const stripe = {
    subscriptions: {
      retrieve: vi.fn(async (id: string) => {
        const found = subs.find((item) => item.id === id)
        if (!found) throw new Error(`missing ${id}`)
        return found
      }),
      cancel,
    },
  } as unknown as Stripe
  return { stripe, cancel }
}

describe.skipIf(!process.env.DATABASE_URL)('syncSubscription (real db)', () => {
  let sync: typeof import('./sync')
  let db: typeof import('@/lib/db').db

  beforeAll(async () => {
    db = (await import('@/lib/db')).db
    sync = await import('./sync')
    await db.insert(user).values({ id: USER, name: 'Billing', email: `${USER}@example.test`, emailVerified: true })
  })

  beforeEach(async () => {
    await db.delete(subscriptions).where(eq(subscriptions.userId, USER))
  })

  afterAll(async () => {
    await db.delete(user).where(eq(user.id, USER))
  })

  const row = async () => (await db.select().from(subscriptions).where(eq(subscriptions.userId, USER)))[0]

  it('creates the row with plan and period from the subscription', async () => {
    const { stripe } = fakeStripe([sub('sub_a', 'active', 'pro_monthly')])
    await sync.syncSubscription('sub_a', stripe)
    expect(await row()).toMatchObject({ plan: 'pro', status: 'active', stripeSubscriptionId: 'sub_a' })
    expect((await row())?.currentPeriodStart?.getTime()).toBe(1_800_000_000_000)
  })

  it('is safe to deliver twice', async () => {
    const { stripe } = fakeStripe([sub('sub_a', 'active')])
    await sync.syncSubscription('sub_a', stripe)
    await sync.syncSubscription('sub_a', stripe)
    expect(await row()).toMatchObject({ plan: 'starter', status: 'active' })
  })

  it('moves to the cancelled state when the same subscription ends', async () => {
    const subs = [sub('sub_a', 'active')]
    const { stripe } = fakeStripe(subs)
    await sync.syncSubscription('sub_a', stripe)
    subs[0] = sub('sub_a', 'canceled')
    await sync.syncSubscription('sub_a', stripe)
    expect((await row())?.status).toBe('canceled')
  })

  it('does not let an old cancelled subscription overwrite a live one', async () => {
    const { stripe } = fakeStripe([sub('sub_new', 'active', 'pro_monthly'), sub('sub_old', 'canceled')])
    await sync.syncSubscription('sub_new', stripe)
    await sync.syncSubscription('sub_old', stripe)
    expect(await row()).toMatchObject({ stripeSubscriptionId: 'sub_new', status: 'active', plan: 'pro' })
  })

  it('accepts a new subscription after the previous one ended', async () => {
    const { stripe } = fakeStripe([sub('sub_old', 'canceled'), sub('sub_new', 'active', 'pro_monthly')])
    await sync.syncSubscription('sub_old', stripe)
    await sync.syncSubscription('sub_new', stripe)
    expect(await row()).toMatchObject({ stripeSubscriptionId: 'sub_new', status: 'active' })
  })

  it('cancels a second live subscription and keeps the first', async () => {
    const { stripe, cancel } = fakeStripe([sub('sub_a', 'active'), sub('sub_b', 'active', 'pro_monthly')])
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    await sync.syncSubscription('sub_a', stripe)
    await sync.syncSubscription('sub_b', stripe)
    expect(cancel).toHaveBeenCalledWith('sub_b', { prorate: true, invoice_now: true })
    expect((await row())?.stripeSubscriptionId).toBe('sub_a')
    error.mockRestore()
  })

  it('rejects an unknown price so Stripe retries', async () => {
    const { stripe } = fakeStripe([sub('sub_a', 'active', 'mystery')])
    await expect(sync.syncSubscription('sub_a', stripe)).rejects.toThrow('subscription_unknown_price')
  })

  it('ignores a subscription for a deleted user', async () => {
    const orphan = { ...sub('sub_x', 'canceled'), customer: 'cus_gone', metadata: { user_id: 'gone' } } as Sub
    const { stripe } = fakeStripe([orphan])
    await expect(sync.syncSubscription('sub_x', stripe)).resolves.toBeUndefined()
  })

  it('counts usage only inside the period and moves past a stale period by resyncing', async () => {
    const { getAllowance } = await import('./allowance')
    const now = new Date(1_800_000_000_000 + 2_592_000_000 + 1000)
    const before = new Date(1_800_000_000_000 - 1000)
    await db.insert(runUsage).values([
      { runId: `${USER}-before`, userId: USER, createdAt: before },
      { runId: `${USER}-new`, userId: USER, createdAt: new Date(now.getTime() - 500) },
    ])
    const renewed = sub('sub_a', 'active', 'starter_monthly', 1_800_000_000 + 2_592_000)
    const { stripe } = fakeStripe([sub('sub_a', 'active')])
    await sync.syncSubscription('sub_a', stripe)
    vi.spyOn(await import('./stripe'), 'getStripe').mockReturnValue(fakeStripe([renewed]).stripe)
    const allowance = await getAllowance({ id: USER, isAnonymous: false }, now)
    expect(allowance).toMatchObject({ plan: 'starter', used: 1, max: 4, maxRounds: 5 })
    expect(new Date(allowance.resetAt!).getTime()).toBe((1_800_000_000 + 5_184_000) * 1000)
  })
})
