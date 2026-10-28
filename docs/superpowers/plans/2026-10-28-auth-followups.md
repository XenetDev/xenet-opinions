# Auth follow-ups (deferred, 2026-10-28)

Source: SDD ledger for the sign-in feature.

- The mailer's fetch to Resend has no timeout.
- Apple sign-in is untested (no credentials).
- No route test asserts that the anonymous quota reaches `checkRunPolicy`.
- The account-deletion alert dialog is not axe-checked.
- A `signOut` error is not handled.
- Any `?error=` value on `/sign-in` maps to the expired-link notice.
- The sign-in page has no logo (no brand asset yet).
- Rate-limit IP headers are spoofable when `web` is exposed without a proxy.
