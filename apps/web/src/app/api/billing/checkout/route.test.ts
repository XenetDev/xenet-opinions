import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/env', () => ({ env: { NEXT_PUBLIC_APP_URL: 'https://app.test' } }))
const getSessionUser = vi.hoisted(() => vi.fn())
vi.mock('@/lib/session', () => ({ getSessionUser }))
const rows = vi.hoisted(() => ({ current: [] as unknown[], inserted: [] as unknown[] }))
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: async () => rows.current }) }),
    insert: () => ({
      values: (value: unknown) => {
        rows.inserted.push(value)
        return { onConflictDoNothing: async () => {} }
      },
    }),
  },
}))
const stripe = vi.hoisted(() => ({
  customers: { create: vi.fn() },
  prices: { list: vi.fn() },
  checkout: { sessions: { create: vi.fn() } },
}))
vi.mock('@/server/billing/stripe', () => ({ billingEnabled: () => enabled.value, getStripe: () => stripe }))
const enabled = vi.hoisted(() => ({ value: true }))
vi.mock('@/server/billing/sync', () => ({ isPaidStatus: (status: string) => status === 'active' }))

import { POST } from './route'

const req = (body: unknown) => new Request('http://x', { method: 'POST', body: JSON.stringify(body) })
const member = { id: 'u1', isAnonymous: false, email: 'a@b.test' }

beforeEach(() => {
  enabled.value = true
  rows.current = []
  rows.inserted = []
  getSessionUser.mockResolvedValue(member)
  stripe.customers.create.mockResolvedValue({ id: 'cus_1' })
  stripe.prices.list.mockResolvedValue({ data: [{ id: 'price_1' }] })
  stripe.checkout.sessions.create.mockResolvedValue({ url: 'https://stripe.test/s' })
})

afterEach(() => vi.clearAllMocks())

describe('POST /api/billing/checkout', () => {
  it('is hidden when billing is off', async () => {
    enabled.value = false
    expect((await POST(req({ plan: 'pro' }))).status).toBe(404)
  })

  it.each([null, { isAnonymous: true, id: 'g' }])('refuses signed-out users and guests', async (user) => {
    getSessionUser.mockResolvedValue(user)
    expect((await POST(req({ plan: 'pro' }))).status).toBe(401)
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it.each(['free', 'guest', 'enterprise', undefined])('rejects plan %s', async (plan) => {
    expect((await POST(req({ plan }))).status).toBe(400)
  })

  it('refuses a second subscription', async () => {
    rows.current = [{ status: 'active', stripeCustomerId: 'cus_1' }]
    const res = await POST(req({ plan: 'pro' }))
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'already_subscribed' })
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it('creates one customer and a subscription checkout tied to the user', async () => {
    const res = await POST(req({ plan: 'starter' }))
    expect(await res.json()).toEqual({ url: 'https://stripe.test/s' })
    expect(stripe.customers.create).toHaveBeenCalledWith(
      { email: 'a@b.test', metadata: { user_id: 'u1' } },
      { idempotencyKey: 'customer-u1' },
    )
    expect(stripe.prices.list).toHaveBeenCalledWith({ lookup_keys: ['starter_monthly'], active: true, limit: 1 })
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'subscription',
        customer: 'cus_1',
        client_reference_id: 'u1',
        line_items: [{ price: 'price_1', quantity: 1 }],
        subscription_data: { metadata: { user_id: 'u1' } },
        success_url: 'https://app.test/pricing?session_id={CHECKOUT_SESSION_ID}',
      }),
    )
  })

  it('reuses the customer after a cancelled subscription', async () => {
    rows.current = [{ status: 'canceled', stripeCustomerId: 'cus_old' }]
    await POST(req({ plan: 'pro' }))
    expect(stripe.customers.create).not.toHaveBeenCalled()
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(expect.objectContaining({ customer: 'cus_old' }))
  })
})
