import Stripe from 'stripe'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/env', () => ({ env: { STRIPE_WEBHOOK_SECRET: 'whsec_test' } }))
const syncSubscription = vi.hoisted(() => vi.fn())
vi.mock('@/server/billing/sync', () => ({ syncSubscription }))

import { POST } from './route'

const signed = (event: object) => {
  const payload = JSON.stringify(event)
  const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_test' })
  return new Request('http://x/api/billing/webhook', {
    method: 'POST',
    body: payload,
    headers: { 'stripe-signature': signature },
  })
}

beforeEach(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_x'
  syncSubscription.mockReset()
})

afterEach(() => {
  delete process.env.STRIPE_SECRET_KEY
})

describe('POST /api/billing/webhook', () => {
  it('rejects a missing or forged signature without syncing', async () => {
    const missing = new Request('http://x', { method: 'POST', body: '{}' })
    expect((await POST(missing)).status).toBe(400)
    const forged = new Request('http://x', {
      method: 'POST',
      body: '{}',
      headers: { 'stripe-signature': 't=1,v1=bad' },
    })
    expect((await POST(forged)).status).toBe(400)
    expect(syncSubscription).not.toHaveBeenCalled()
  })

  it.each(['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'])(
    'syncs on %s',
    async (type) => {
      const res = await POST(signed({ id: 'evt', object: 'event', type, data: { object: { id: 'sub_1' } } }))
      expect(res.status).toBe(200)
      expect(syncSubscription).toHaveBeenCalledWith('sub_1', expect.anything())
    },
  )

  it('syncs the subscription on checkout.session.completed', async () => {
    const event = {
      id: 'e',
      object: 'event',
      type: 'checkout.session.completed',
      data: { object: { subscription: 'sub_2' } },
    }
    expect((await POST(signed(event))).status).toBe(200)
    expect(syncSubscription).toHaveBeenCalledWith('sub_2', expect.anything())
  })

  it('acknowledges other events without syncing', async () => {
    const event = { id: 'e', object: 'event', type: 'invoice.paid', data: { object: {} } }
    expect((await POST(signed(event))).status).toBe(200)
    expect(syncSubscription).not.toHaveBeenCalled()
  })

  it('returns 500 so Stripe retries when the sync fails', async () => {
    syncSubscription.mockRejectedValue(new Error('db down'))
    const event = { id: 'e', object: 'event', type: 'customer.subscription.updated', data: { object: { id: 's' } } }
    await expect(POST(signed(event))).rejects.toThrow('db down')
  })
})
