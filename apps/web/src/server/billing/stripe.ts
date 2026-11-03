import Stripe from 'stripe'

let client: Stripe | undefined

export const billingEnabled = () => !!process.env.STRIPE_SECRET_KEY

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('billing_disabled')
  client ??= new Stripe(key, { timeout: 15_000, maxNetworkRetries: 1 })
  return client
}
