# Auth follow-ups (deferred, 2026-10-28)

Source: SDD ledger for the sign-in feature.

- Apple sign-in is untested (no credentials).
- The account-deletion alert dialog is not axe-checked.
- A `signOut` error is not handled.
- Any `?error=` value on `/sign-in` maps to the expired-link notice.
- The sign-in page has no logo (no brand asset yet).
- Rate-limit IP headers are spoofable when `web` is exposed without a proxy.
- No job deletes orphaned anonymous users: users that never sign in, a second user from tabs racing in a browser without `navigator.locks`, and the anonymous user left behind when a magic link is opened in a browser without the matching link intent.
- Task 2 skipped the Better Auth CLI `generate` check against the Drizzle schema.
- A relink failure during sign-in returns a raw 500 and the magic-link token is already used.
- Social sign-in errors land on Better Auth's default error page, not `/sign-in`.
- Opening the delete-confirmation link in another browser returns raw JSON.
