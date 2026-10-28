# Accounts and sign-in: design

Addendum to `docs/superpowers/specs/2026-10-19-xenet-opinions-design.md`. The owner asked for a real account system on 2026-10-28 and skipped the design conversation; every decision below is the builder's call unless marked **owner**.

## Intent

Today every visitor is an anonymous Better Auth user and the hosted demo's quota is keyed on that user id. There is no way to come back on another device, no way to earn more runs, and nothing stops a visitor from clearing cookies for a fresh quota. **Owner:** add sign-in with magic link and social providers using ReUI's `auth-3` block, keep anonymous use, give anonymous visitors 1 run per 24 hours and registered users 3, and make it solid enough to open-source: no shortcuts, hardened defaults, wired to the existing Postgres.

## Goals

- A visitor can use the app without signing in exactly as today. Signing in is an upgrade, never a wall.
- Signing in from an anonymous session keeps everything: the user's chats, uploads, runs, interviews and the 24-hour quota window move to the registered account. The same holds when the registered account already exists (returning user on a new device).
- Providers: magic link by email (Resend), Google, GitHub. Apple is wired but off until credentials exist. Every provider is enabled only by its environment variables, so a self-hoster with no keys gets the anonymous-only app and a sign-in page that says so.
- Quotas: `MAX_RUNS_PER_DAY_ANONYMOUS` (default 1) and `MAX_RUNS_PER_DAY` (default 3). The usage bar and the quota notice tell anonymous users that signing in gives them more.
- Hardened: rate limits stored in Postgres (serverless-safe), hashed single-use magic-link tokens that expire in 15 minutes, callback URLs validated against the app origin, no open redirects on `next`, no account enumeration from the magic-link form, secure cookies in production, account deletion with cleanup.
- Signed-in users see who they are and can sign out or delete their account from the header.
- Everything existing keeps working: all routes still take the session user; the mock stack, the Docker bundle and the hosted deploy all run with and without provider keys.

## Non-goals

- Passwords, two-factor, passkeys, organisations, admin roles, email change, profile editing.
- Apple sign-in on the hosted demo at launch (needs an Apple Developer account, a Services ID, a key and a verified domain). The provider is env-gated and documented; the button appears when its variables are set.
- A separate "anonymous" tier beyond the run quota. Anonymous and registered users see the same product.
- Preview deployments on Vercel (they would share the production database).

## Anti-goals

- A visitor who never signs in must never be asked to, blocked, or lose a chat they started before signing in.
- Signing in must never create a second quota. One person, one window: the anonymous runs count against the registered account after linking.
- No provider SDK or secret in the client bundle. Provider availability reaches the browser as booleans.
- No change to the engine, the run routes' contracts, the data parts or the stream.

## Decisions

### Identity model

- **Better Auth stays**, with the `anonymous` plugin as today plus `magicLink` and the built-in social providers. One `user` row per person; `user.isAnonymous` distinguishes the two kinds. No new user columns.
- **Linking.** The anonymous plugin's `onLinkAccount` hook runs when an anonymous session signs in by any provider, before the plugin deletes the anonymous user. In one transaction it reassigns `chats.user_id`, `runs.user_id` and `uploads.user_id` from the anonymous user to the new (or existing) user. `interviews` and `messages` hang off chats and need nothing. The anonymous row is then deleted by the plugin, cascading its sessions. If the hook fails, the sign-in fails and nothing is deleted (verified by test). Verified at build time against the plugin source that the hook runs before the delete.
- **Session user.** `getSessionUser` returns `{ id, isAnonymous, email, name, image }`. Existing callers keep using `id`; new callers (limits, header) use the rest. Session cookie cache stays off: `isAnonymous` must be fresh after linking.
- **Sessions** last 30 days and refresh daily (`session.expiresIn`, `session.updateAge`). Sign-out revokes the current session. `user.deleteUser` is enabled with `sendDeleteAccountVerification` through the mailer, so deletion always confirms by email; `afterDelete` removes the user's upload objects from storage (rows cascade).

### Providers and configuration

- Env (all optional, web only): `RESEND_API_KEY`, `EMAIL_FROM`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET`, `APPLE_APP_BUNDLE_IDENTIFIER`. A social provider is on when both its id and secret are set; `superRefine` rejects one without the other. `EMAIL_FROM` is required when `RESEND_API_KEY` is set and must be `Name <address>` or a bare address.
- **Mailer** (`apps/web/src/lib/mailer.ts`): `resend` when `RESEND_API_KEY` is set, calling Resend's HTTP API with `fetch` (no SDK); otherwise `console`, which prints the link to the server log and is refused in production (`NODE_ENV=production` with no `RESEND_API_KEY` disables the magic-link provider instead of logging secrets). The magic-link provider is on when the mailer is `resend`, or when it is `console` outside production.
- **`authProviders()`** (`apps/web/src/lib/auth-providers.ts`) derives `{ magicLink, google, github, apple }` booleans from env. The server passes them to the sign-in page and the header. `GET /api/auth/providers` is not added; nothing needs it.
- Better Auth config (`apps/web/src/lib/auth.ts`): `trustedOrigins: [NEXT_PUBLIC_APP_URL]`; `rateLimit: { enabled: true, storage: 'database', window: 60, max: 60, customRules: { '/sign-in/magic-link': { window: 60, max: 3 }, '/sign-in/anonymous': { window: 60, max: 10 }, '/delete-user': { window: 60, max: 3 } } }` (enabled in every environment so tests cover it; the model is `rateLimit` → table `rate_limit`, added to `packages/db/src/schema/auth.ts` with migration `0005_*`, shape confirmed with `@better-auth/cli generate` during the build); `magicLink({ expiresIn: 900, storeToken: 'hashed', sendMagicLink })`; `advanced.useSecureCookies` on in production; `advanced.ipAddress.ipAddressHeaders: ['x-forwarded-for', 'x-real-ip']` (Vercel and the Caddy proxy set them); `account.accountLinking` left at Better Auth's defaults (implicit linking only on a provider-verified email), documented.
- Google and GitHub use Better Auth's built-in providers; the callback paths are `/api/auth/callback/<provider>`. Apple uses the built-in provider and additionally needs `https://appleid.apple.com` in `trustedOrigins` (added only when Apple is on).

### Quota

- `Limits` gains `anonymous: boolean` and `signedInMaxRunsPerDay: number`; `maxRunsPerDay` becomes the limit for the current user (`MAX_RUNS_PER_DAY_ANONYMOUS` for anonymous, `MAX_RUNS_PER_DAY` otherwise). `getLimits(user)` takes the session user; `limitsFromEnv(source, { anonymous })` stays pure. Engine `MAX_RUNS_PER_DAY` constant updates to 3 and a `MAX_RUNS_PER_DAY_ANONYMOUS = 1` is added beside it.
- The messages route passes `limits.maxRunsPerDay` as today, so `checkRunPolicy` is unchanged. Because linking moves the runs, `runsStartedSince(userId)` already counts a person's anonymous runs after they sign in.
- **UI.** `UsageBar` renders, for anonymous users in demo mode, a trailing link "Sign in for N runs a day" (`N = signedInMaxRunsPerDay`) pointing at `/sign-in?next=<current path>`. The quota-exceeded notice for anonymous users reads "You've used today's free run. Sign in for N runs a day, or come back tomorrow." The registered wording is unchanged.
- Hosted demo env: `MAX_RUNS_PER_DAY_ANONYMOUS=1`; `MAX_RUNS_PER_DAY` stays at the owner's temporary 10 until they say otherwise.

### Sign-in page

- Route `/sign-in` in a new `(auth)` route group with its own layout (no chat header). Server component reads `authProviders()` and the sanitised `next`; client component `SignInForm` does the work.
- Layout is ReUI `auth-3`: left column with logo, "Sign in", a line of copy, the email form, "Or continue with", the provider buttons; right column with the block's `WaveDots` background. The right column's demo testimonial and "trusted by" brands are replaced with product copy: a headline ("Ask how people would react before you decide"), one sentence, and three short lines on what signing in gives (more runs a day, conversations on every device, the same chat on your phone later). No fake quotes, no brand logos. Provider logos come from the block's SVG files (Google, GitHub light/dark, Apple light/dark) installed under `components/ui/svgs/`; the block's `IconPlaceholder` is replaced with Lucide icons; `Item` is installed from shadcn.
- Behaviour: submitting the email calls `authClient.signIn.magicLink({ email, callbackURL: next })` and always shows the "Check your email" state with the address and a "Use a different email" link, whether or not the address exists (no enumeration; the server's answer is the same either way). Provider buttons call `authClient.signIn.social({ provider, callbackURL: next })`. Errors from Better Auth (rate limited, provider failure) show an inline `Alert`. A `?error=` query from a failed magic-link verification shows "That link has expired or was already used. Request a new one." Buttons disable while a request is in flight. When no provider is on, the page shows "Sign-in is not set up on this instance" with a link to the hosting docs and the "Continue without signing in" link.
- `next` is accepted only when it is a path starting with `/` and not `//` or containing a scheme; anything else becomes `/`. Better Auth independently validates `callbackURL` against `trustedOrigins`.
- Already-signed-in (non-anonymous) visitors to `/sign-in` are redirected to `next`.
- The page is `noindex`, `Cache-Control: no-store`, and passes the axe test like every other screen.

### Header

- `AccountMenu` replaces nothing and sits before the theme toggle. Anonymous: a ghost "Sign in" button linking to `/sign-in?next=<pathname>`. Registered: an `Avatar` (image or initials from name or email) opening a `DropdownMenu` with the name and email as a label, "Sign out", and "Delete account". Sign out calls `authClient.signOut()`, then `router.push('/')` and `router.refresh()`; the existing `AnonymousSession` provider creates a fresh anonymous session. Delete account opens an `AlertDialog` explaining that a confirmation email is sent, then calls `authClient.deleteUser({ callbackURL: '/' })`; a toast confirms the email was sent.
- The header reads the session through `authClient.useSession()` so it updates without a reload after sign-in and sign-out.

### Tests

- Unit: env schema (provider pairs, `EMAIL_FROM` rule, production refuses console mailer), `authProviders()` table, `sanitiseNext()` table, mailer (`fetch` mocked for Resend: endpoint, headers, body; console driver prints the URL once), `limitsFromEnv` per user kind, `UsageBar` sign-in link only for anonymous demo users, `sendNotices` wording per kind, `SignInForm` states (providers shown or hidden, sent state, error state, disabled while pending, axe), `AccountMenu` (anonymous vs registered, sign-out calls, axe), `getSessionUser` mapping.
- Database: `relinkAnonymousUser` moves chats, runs and uploads and leaves other users untouched; the anonymous user's run count is visible under the new user id; the rate-limit table accepts Better Auth's writes (one request through `auth.api` with rate limiting on).
- Route tests that mock `@/lib/session` gain the new fields; no route behaviour changes.
- Browser: dev stack with the console mailer: sign in by magic link from an anonymous session with one chat, see the chat and the usage bar flip to 3 runs, sign out, sign in again on a second chat, see both. Hosted: magic link via Resend, Google and GitHub once the owner's credentials are in place, each starting from an anonymous session with a run.

### Deployment

- Branch `jdships/auth`, PR against `XenetDev/xenet-opinions` main, CI green, browser check on the Vercel production deploy after merge. Vercel production gets `MAX_RUNS_PER_DAY_ANONYMOUS=1` now and the provider variables as the owner supplies them; each provider lights up on the next deploy without code changes.
- Docs: README (sign-in paragraph, quotas), `docs/hosting.md` (variable table, provider setup with the exact redirect URIs, mailer, rate limits), `docs/hosting-runbook.md` (Vercel variables), `.env.example`, `.env.selfhost.example`, the compose files pass the new variables to `web`, CONTRIBUTING (console mailer in dev).

## Constraints

- MIT clean-room for product code; ReUI files under the owner's Pro licence as before; no Better Auth internals copied.
- Strict TypeScript with `noUncheckedIndexedAccess`; Biome formatting; `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm --filter web build` green at the end of every task.
- Comments only for invariants, single line.
- Secrets never appear in logs, tests, fixtures or the client bundle. The console mailer prints the link, which is a secret, and is therefore refused in production.

## Left to the builder

- Exact copy of the magic-link email (subject, body); plain text plus a minimal HTML version with one button.
- Whether `SignInForm` keeps the ReUI `Field` primitives or the repo's existing `field.tsx` (they are the same file; use what is installed).
- Initials rule for the avatar fallback (first letters of up to two words of the name, else the email's first letter).
- The `(auth)` layout's handling of the theme toggle (keep it in the corner or omit it).
