# Phase 3 follow-ups (deferred from per-task and final review, 2026-10-21)

Source: SDD ledger for docs/superpowers/plans/2026-10-21-phase-3-interviews.md. Everything below is Phase 4+ or dropped-with-reason.

## Phase 4 design notes (binding inputs)
- Real MiroFish interview request/response shape is copied from the mock, not captured. The first real run must capture `simulation.interview-batch.json`; only `interviewsToParts` and the mock should need changes. The error code MiroFish returns for a closed env is also a guess; the route degrades to failed cards either way.
- Report chat on a closed env is assumed to work (the report agent reads from Zep/graph). Verify on the first real run.
- Vercel: a 200 s interview plus DB writes fits `maxDuration=300` only on plans that honour it; Hobby caps functions at 60 s. Document in Phase 4 `docs/hosting.md`.
- Concurrent follow-ups in one chat are not serialised.
- Chat delete does not close the simulation env; the sweeper only sees envs whose run row still exists.
- Verify Vitest `globalSetup` + `test.env` propagation and Turbo strict env mode in CI first.

## Deferred minors (per-task reviewers; final triage pending)
- Task 1: minor (deferred): currentPackageSuffix reads package.json from cwd (root/IDE runner → name fails regex, unclear error); config→db relative .ts import forced allowImportingTsExtensions/noEmit in tsconfig.base; empty AggregateError message in skip log; storage/mirofish get DBs they never use; global-setup has no direct test
- Task 2: minor (deferred): buildChatHistory returns all rows when afterMessageId missing (unspecified/untested); maxTurns=0 returns all; mirofishAgentId('007')→7 not round-trip symmetric; errored-result test asserts 'No answer' discarding provider text; parts.test import order
- Task 3: minor (deferred): sweepEnvs one failing store.update abandons the batch (no per-run try/catch); loop returns without awaiting in-flight sweep (spurious log at shutdown); empty catch {} on stop; hardcoded limit 50; drizzle listEnvsToSweep limit untested; real-timer tests (60-70 ms) may flake on slow CI
- Task 4: minor (deferred): DB failure after MiroFish success leaves empty assistant row (persist step outside delete-on-failure); keepalive runStore.update outside execute can orphan turn rows if it throws; extendKeepalive from stale snapshot loses one extension under concurrent interviews (plan-mandated form); history cast instead of narrowing; two wall-clock-window tests; env_closed db test doesn't assert keepalive unchanged/no interviews rows; no test for persist-step DB failure; same user message id retry creates second assistant row + MiroFish call (undocumented)
- Task 5: minor (deferred): chat.tsx still maps run_finished (Task 7 removes); envState narrowing duplicated in run/route.ts and chat-page.ts, union redeclared in use-run-status; dense ternary line in messages route; /run test lacks 'closed' mapping case
- Task 6: minor (deferred): MAX_INTERVIEW_AGENTS re-export from parts.ts relies on keepalive.ts staying type-only (fragile client-safety); toggle not stable/max check from render snapshot; stale full hint after remove/clear; live region mounted conditionally; Details button may overlap truncated name; coverage gaps (Details leaves aria-pressed, no provider → no aria-pressed, hint clears, done card with empty answer); test const declared after use; import order
- Task 7: minor (deferred): selection cleared before server-side send success and even when target is report; TargetSelector ignores disabled while streaming; stale refusal notice after picking a persona; env seed read only at mount; duplicate /run fetch on live completion (fix round may remove); two role=status regions can coexist (badge + notice) making getByRole('status') fragile
- Task 8: minor (deferred): WORKER_POLL_MS/MAX_CONCURRENT_RUNS/WORKER_ID and storage vars not in turbo globalEnv (shell overrides dropped under pnpm dev); README doesn't say history is limited to 10 turns; shimmer only observed with a delayed-fetch harness; CI not run (no push)

### Final review minors (deferred)
- Interview-path DB failure after MiroFish success leaves pending cards and a report-worded notice.
- `history` cast in follow-up.ts instead of narrowing.
- global-setup "skipped" wording when the admin connection fails though DATABASE_URL stays set.
- Repo-wide `allowImportingTsExtensions`/`noEmit` for one relative .ts import.
- Roster selectable while target is "Ask the report" and silently cleared on send.

Final review triage: all deferred; none block merge.
- Final re-review: a worker crashing between the `closeEnv` claim and the MiroFish `stop`/`closeEnv` calls leaves the env running with no retry (implied by "closed regardless of MiroFish errors").
- Final re-review: the `closeEnv` claim predicate does not recheck `env_keepalive_until <= now`, so an interview that extends the deadline between list and claim still gets its env closed (pre-existing race, now easy to close in the claim).
