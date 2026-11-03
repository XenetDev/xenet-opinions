// Usage: STRIPE_SECRET_KEY=... node scripts/stripe-setup.mjs https://your-app.example
const key = process.env.STRIPE_SECRET_KEY
const appUrl = process.argv[2]
if (!key || !appUrl) {
  console.error('Usage: STRIPE_SECRET_KEY=... node scripts/stripe-setup.mjs <app-url>')
  process.exit(1)
}

const PLANS = [
  {
    lookupKey: 'starter_monthly',
    name: 'Opinions Starter',
    amount: 1000,
    description: '4 simulation runs a month, up to 5 rounds each',
  },
  {
    lookupKey: 'pro_monthly',
    name: 'Opinions Pro',
    amount: 2000,
    description: '6 simulation runs a month, up to 10 rounds each',
  },
]
const EVENTS = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
]

async function api(method, path, params) {
  const body = params && new URLSearchParams(params)
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: { authorization: `Bearer ${key}`, ...(body && { 'content-type': 'application/x-www-form-urlencoded' }) },
    ...(body && { body }),
  })
  const json = await response.json()
  if (!response.ok) throw new Error(`${method} ${path}: ${json.error?.message}`)
  return json
}

const prices = []
for (const plan of PLANS) {
  const { data } = await api('GET', `prices?lookup_keys[]=${plan.lookupKey}&active=true&expand[]=data.product`)
  let price = data[0]
  if (!price) {
    const product = await api('POST', 'products', { name: plan.name, description: plan.description })
    price = await api('POST', 'prices', {
      product: product.id,
      unit_amount: plan.amount,
      currency: 'usd',
      'recurring[interval]': 'month',
      lookup_key: plan.lookupKey,
    })
  }
  prices.push(price)
  console.log(`${plan.lookupKey}: ${price.id}`)
}

const productOf = (price) => (typeof price.product === 'string' ? price.product : price.product.id)
const portal = {
  'business_profile[headline]': 'Manage your Opinions plan',
  'features[invoice_history][enabled]': 'true',
  'features[payment_method_update][enabled]': 'true',
  'features[subscription_cancel][enabled]': 'true',
  'features[subscription_cancel][mode]': 'at_period_end',
  'features[subscription_update][enabled]': 'true',
  'features[subscription_update][default_allowed_updates][0]': 'price',
  'features[subscription_update][proration_behavior]': 'always_invoice',
  'features[subscription_update][schedule_at_period_end][conditions][0][type]': 'decreasing_item_amount',
  default_return_url: `${appUrl}/pricing`,
}
prices.forEach((price, index) => {
  portal[`features[subscription_update][products][${index}][product]`] = productOf(price)
  portal[`features[subscription_update][products][${index}][prices][0]`] = price.id
})
const { data: configs } = await api('GET', 'billing_portal/configurations?is_default=true&limit=1')
const config = configs[0]
  ? await api('POST', `billing_portal/configurations/${configs[0].id}`, portal)
  : await api('POST', 'billing_portal/configurations', portal)
console.log(`portal: ${config.id}`)
if (!config.is_default) {
  console.error(
    'This portal configuration is not the default. Save portal settings once in the Stripe Dashboard, then rerun.',
  )
  process.exit(1)
}

if (!appUrl.includes('localhost')) {
  const url = `${appUrl}/api/billing/webhook`
  const { data: endpoints } = await api('GET', 'webhook_endpoints?limit=100')
  if (endpoints.some((endpoint) => endpoint.url === url)) console.log(`webhook exists: ${url}`)
  else {
    const params = { url }
    EVENTS.forEach((event, index) => {
      params[`enabled_events[${index}]`] = event
    })
    const endpoint = await api('POST', 'webhook_endpoints', params)
    console.log(`webhook created: ${url}`)
    console.log(`STRIPE_WEBHOOK_SECRET=${endpoint.secret}`)
  }
}
