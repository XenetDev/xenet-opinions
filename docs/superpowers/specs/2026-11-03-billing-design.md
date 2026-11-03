# Billing and plans: design

**Owner (2026-11-03):** the hosted app is the real product, not a demo. It sells two monthly plans, limits runs to what each plan can afford, and has a pricing page, upgrade buttons and proper usage cards. Free limits come down.

## Why

A run costs real money. Estimated from the one full `gpt-4.1` run (3 rounds, 10 personas): about $1.30 all-in at 3 rounds, $1.50 at 5, $2.30 at 10, and $5 or more with a large document producing about 30 personas. After Stripe's fees we keep about $9.34 of $10 and $18.98 of $20. One run a day would cost about $39 a month on a $10 plan, so the owner chose monthly allowances over daily limits. Production's current limits (10 runs a day, 10 rounds, for any signed-in user) could cost about $23 a day per free user.

## Plans (owner approved)

| Plan | Who | Runs | Max rounds | Period |
|---|---|---|---|---|
| Guest | Anonymous visitor | 1 | 3 | Lifetime of the anonymous account |
| Free | Signed in, no subscription | 2 | 3 | Calendar month, UTC |
| Starter | $10/month | 4 | 5 | Stripe billing period |
| Pro | $20/month | 6 | 10 | Stripe billing period |

## Goals

- Every new run counts against the user's plan allowance for the current period, and is refused with a clear message and an upgrade path when none is left.
- The rounds picker offers only what the plan allows, and the server enforces it.
- A pricing page shows the plans and the user's current plan. Upgrade goes to Stripe-hosted Checkout. Manage billing goes to the Stripe Customer Portal.
- The usage card shows plan name, runs used of allowance, the reset date and an upgrade link.
- Stripe is the source of truth for subscriptions. Webhooks keep our database in sync, and a user returning from Checkout sees their new plan immediately.
- Self-hosters are unaffected: with no `STRIPE_SECRET_KEY`, nothing about billing appears and today's `DEMO_MODE` behaviour is unchanged.

## Non-goals

- Annual plans, trials, coupons, seats, teams, pay-per-run top-ups, rollover of unused runs.
- Metered billing. The allowance is enforced by the app.
- Priority in the run queue for paid plans.
- Limiting interviews or report follow-ups on finished runs.
- Managing Stripe live-mode cutover in this work beyond a setup script and docs.
- Stripe Tax collection or Managed Payments. Threshold monitoring only.

## Anti-goals

- Charging someone without giving them the plan, or leaving a cancelled subscriber on a paid plan.
- A user losing paid access because a webhook was late or delivered twice or out of order.
- A failed run being unrecoverable. It holds its slot, but the free retry is always available.
- A user hitting the limit only after filling in the drafted card and waiting for the check.
- Any Stripe secret in client code, in the repo, or in logs.
- Deleting an account while its subscription keeps billing.

## Facts

- Quotas live in `checkRunPolicy` (`packages/engine/src/policy/quota.ts`), `limits.ts`, `run-gate.ts`, `usage.ts` and `usage-from.ts`, all keyed to a rolling 24 hour window and `DEMO_MODE`. `checkRunGate` is used by both `POST /messages` and `POST /readiness`.
- `runsStartedSince` counts runs where `retry_of` is null, so retries are already free.
- Anonymous users are real `user` rows with `isAnonymous`. On sign-in `relinkAnonymousUser` moves their chats, runs and uploads to the real user and deletes the anonymous row.
- The usage card, `sendNotices` and rounds picker (`RoundsPicker`, fed by `limits.maxRounds`) already exist. The app has Better Auth 1.7 and Postgres through Drizzle.
- Env vars must be listed in `turbo.json`'s `globalEnv` or they do not reach dev and builds.
- Stripe sandbox products already exist: `Opinions Starter` with price lookup key `starter_monthly` ($10/month), and `Opinions Pro` with `pro_monthly` ($20/month).
- `opinions.xenet.ai` does not resolve yet, and the upload bucket's CORS rule rejects it.

## Decisions

**From the owner:** the plan table above; monthly allowances, not daily limits; Stripe-hosted Checkout; two flat-rate monthly prices; free tier without a card.

**From Stripe's planner (defaults accepted):** Checkout Sessions in `subscription` mode, Customer Portal for changes and cancellation, Smart Retries and automatic emails for failed payments, cancel at period end, threshold monitoring for tax.

**Controller's calls, to be checked by the owner:**

- **Plan config.** One table in code (`@xo/engine` policy), not env vars and not Stripe metadata. Prices map to plans by lookup key.
- **Which limits apply.** `STRIPE_SECRET_KEY` set: plans apply, and `DEMO_MODE`, `DEMO_MAX_ROUNDS` and `MAX_RUNS_PER_DAY*` are ignored, so production can remove them. Not set: exactly today's behaviour. `DEMO_PAUSED` keeps working in both.
- **What counts as a used run (owner, 2026-11-03).** Every root run (`retry_of` null) uses a slot when it is created, including cancelled and failed ones. Retrying or restarting a failed run is always free and needs no allowance, even with none left or in a later period, so a user can never go over their allowance. The rounds check applies to new runs only. A run that never succeeds keeps its slot; refunds are by hand.
- **Usage survives deletion.** Deleting a chat cascades to its runs, so usage cannot be counted from `runs` or a user could delete chats to get runs back. A `run_usage` ledger holds one row per root run: `run_id` (no foreign key), `user_id`, `created_at`, and no content. It is written in the same transaction that creates the run, and moved by `relinkAnonymousUser`. Deleting an account removes its rows, so re-registering with the same email starts Free again; accepted as a known risk.
- **Guest and sign-in.** A guest's run moves to their account on sign-in and counts toward Free's 2 if it falls in the current month. Checkout requires a signed-in, non-anonymous user; a guest pressing Upgrade gets the sign-in dialog first and then returns to the pricing page.
- **Data.** A `subscriptions` table, one row per user: `user_id`, `stripe_customer_id`, `stripe_subscription_id`, `plan`, `status`, `current_period_start`, `current_period_end`, `cancel_at_period_end`, `updated_at`. The Stripe customer is created on first checkout and reused, with `metadata.user_id` on the customer and subscription.
- **Sync.** Webhook events `checkout.session.completed` and `customer.subscription.created|updated|deleted` do not trust the payload order: each one re-fetches the subscription from Stripe and upserts the row. That makes duplicates and out-of-order delivery harmless. The return from Checkout runs the same sync using the `session_id` in the success URL, so the plan shows at once.
- **Status mapping.** `active`, `trialing` and `past_due` keep the paid plan (Smart Retries gets time to recover a card). Everything else is Free. Period dates come from the subscription item, per the current Stripe API.
- **Plan changes.** Upgrades apply immediately with proration, and the new allowance applies to the runs already used this period. Downgrades and cancellations take effect at period end. Configured in a Customer Portal configuration created by the setup script.
- **Account deletion.** Deleting an account cancels any subscription immediately, before the user row goes. No automatic refund.
- **Limit reached.** `checkRunGate` already runs first on `/readiness`, so the refusal arrives before any model call or card. The notice names the plan and reset date and links to pricing. Pro at its limit sees only the reset date.
- **Rounds above the plan.** The picker lists 1 to the plan's max. A stale client sending more gets the existing `rounds_exceeded`. A composer default above the plan's max clamps to it.
- **Pricing page.** `/pricing` inside the chat layout, three cards (Free, Starter, Pro), the current plan marked, and copy stating runs per month and max rounds. Guests can view it. Entry points: usage card, account menu, limit notices, and a sidebar item.
- **Usage card.** "Starter · 2 of 4 runs", progress bar, "Resets Nov 14", with Upgrade on Free and Starter, and a "Cancels Nov 14" line when set. The account menu gets "Manage billing" for subscribers and "Upgrade" for others. Guests keep the sign-in prompt.
- **Setup script.** `scripts/stripe-setup.mjs` idempotently creates products, prices, the portal configuration and the webhook endpoint for a given key and URL, so live mode repeats what the sandbox has.
- **Env.** `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`, optional, added to the schema, `.env.example`, hosting docs and `turbo.json`. No publishable key is needed for hosted Checkout.

## Known risks

- **Interim limits (owner, 2026-11-03).** Until plans go live, production runs `MAX_RUNS_PER_DAY=2` and `DEMO_MAX_ROUNDS=3` under `DEMO_MODE`.
- **Guest abuse.** A new private window makes a new anonymous account with 1 more run at about $1.30. Accepted for launch and watched; a per-IP cap or Turnstile is the follow-up.
- **Cost estimates** rest on one run. The owner is checking OpenAI's dashboard. Large documents can cost several times the table.
- **Capacity.** `MAX_CONCURRENT_RUNS=1`, so paying users can queue behind others.

## Left to the builder

- Stripe SDK version (latest), route names, file layout, the migration, and the exact shape of the shared limit function.
- How the window query is shared between the usage card and the gate.
- Visual details of the pricing page, using existing components and the ui.sh design guidelines.
- Tests, including webhook signature rejection, duplicate and out-of-order events, and period boundaries.
- Local end-to-end check with `stripe listen` and a Stripe test card.

## Before going live (owner and operator)

- Point `opinions.xenet.ai` at Vercel; update `NEXT_PUBLIC_APP_URL`, `BETTER_AUTH_URL`, OAuth redirects and the bucket's CORS rule.
- Run Stripe's go-live checklist, run the setup script with live keys, and rotate the test key shared in chat.
- Add terms and refund wording, which Stripe requires for subscriptions.
