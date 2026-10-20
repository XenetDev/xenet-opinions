# Phase 0 follow-ups (deferred from per-task and final review, 2026-10-20)

Source: SDD ledger for docs/superpowers/plans/2026-10-19-phase-0-scaffold.md. Triage by the final whole-branch reviewer: fix-before-merge items were applied in 9c52f18; the rest are Phase 1 or dropped.

## Deferred to Phase 1
- Task 1: minor (deferred): @xo/config vitest.base.ts imports vitest/config without declaring vitest as peer dep
- Task 2: minor (deferred): chats.test.ts leaves orphan user rows and never ends the pg client; only chats→messages cascade exercised
- Task 2: minor (deferred): drizzle.config.ts uses `process.env.DATABASE_URL!` (late obscure failure), plan-specified
- Task 3: minor (deferred): untested `!res.ok` + success:true path and JSON-not-envelope path; `doFetch` bound at createHttp time
- Task 3: minor (deferred): abort test relies on synchronous abort after getJson; hangingFetch helper duplicates inline stub
- Task 4: minor (deferred): capture-fixtures writes on non-2xx/non-success and writes untested graph.project.json; scripts/ outside tsc include; no token header in capture script
- Task 4: minor (deferred): endpoint tests lack profilesRealtime invalid-platform case, posts() without limit/offset, id URL-encoding assertion; explicit `timeoutMs: undefined` overrides long timeouts; `export *` of generic schema names from package root
- Task 5: minor (deferred): engine tsconfig include ["src"] skips vitest.config.ts; `ai` under dependencies though type-only import
- Task 6: minor (deferred): `cn` resolved from the `cn` npm package via shadcn 4 output (confirm intended); vitest CJS config warning in apps/web (no "type":"module"); AGENTS.md next-dev artifact; auth-client reads NEXT_PUBLIC_APP_URL unvalidated
- Task 7: minor (deferred): persistence content not asserted (updateMessageParts only checked called); no body-shape guard (malformed body → 500); client-controlled message PK + non-atomic user/assistant inserts; persistAssistantParts lives in echo-stream.ts (move to server/persist.ts for Phase 1); listMessages lacks id tiebreaker; weak negative assertions in 401/404 tests
- Task 8: minor (deferred): shallow tests (no duplicate-stage/running/MessageParts tests, data-testid reliance); home button no in-flight guard; transport rebuilt per render; PromptInput not disabled while streaming; key={i} on text parts; vitest ESM/CJS warning; jsdom@30 engine floor
- Task 8: minor (deferred): toUIMessages still narrows parts from unknown[] to OpinionsUIMessage['parts'] (part-level validation absent); no unit test for toUIMessages
- Task 9: minor (deferred): CI runs twice for same-repo PR branches (push + pull_request); README omits `pnpm lint`

## Final reviewer notes to carry into Phase 1
- Keep response schemas for state-changing MiroFish calls minimal (done for build/create/prepare/start/generate); capture real fixtures with `capture-fixtures` after hardening it (guard on `res.ok` + `success`, add token header, bring `scripts/` under tsc).
- Make the user-message insert idempotent (`onConflictDoNothing`) and wrap user+assistant inserts in a transaction; validate request body with Zod + `validateUIMessages`.
- Move `persistAssistantParts` into `packages/engine/src/projector/materialise.ts` when the projector exists; delete tee-based persistence once `run_events` is the source of truth.
- Replace the `apps/web/.env` symlink with `loadEnvConfig` from `@next/env` in `next.config.ts`; drop the CI env-file step; keep `process.loadEnvFile` for drizzle-kit and the worker.
- Re-export `drizzle-orm` operators from `@xo/db` so the version cannot drift from `apps/web`.
- Rename `export *` schema names in `@xo/mirofish` to `*Schema` when the engine imports them.
- CI: `push: branches: [main]` to avoid double runs on PR branches; add a lint preset so `pnpm lint` does something.
- Add `DATABASE_URL` cleanup/`$client.end()` to `chats.test.ts`; add tests for `toUIMessages`, duplicate-stage rendering, `MessageParts` grouping, 401/404 negative assertions.
- Phase 1 worker must catch `AbortError` separately from `MiroFishError` (caller aborts are rethrown unwrapped).
