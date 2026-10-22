# Xenet Opinions Phase 3: Follow-ups, Interviews, Env Keepalive — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

## Context

Phases 0–2 are merged to `main` (PR #1–#3). The chat can run a full MiroFish simulation, survive reloads, cancel, retry, and manage conversations. The one thing a finished conversation cannot do is continue: `POST /api/chats/:id/messages` returns `409 run_finished` once the latest run is `done` (`apps/web/src/app/api/chats/[id]/messages/route.ts:27-28`). Phase 3 is the spec's "Follow-ups + interviews" step: ask the report agent follow-up questions, or interview the simulated personas, inside the same thread. It is the point where the product starts to feel like the MiroFish demo it wraps.

Decisions confirmed by the user (2026-10-21):
- Follow-ups are **route-side** (the web route calls MiroFish synchronously and streams the reply), not worker-driven. Matches the spec; a reload mid-reply loses the live stream but the reply is persisted and shows on reload.
- Interview UX: **target selector in the composer** ("Ask the report" / "Interview personas") plus **selectable roster cards** with removable chips.
- **Env keepalive sweeper is in scope** (20 min after report, +10 min per interview, cap 60 min; worker sweeps every 60 s; env badge; friendly "closed" error; report chat keeps working).
- Carry-over in scope: **dedicated test database** so `--concurrency=1` is dropped. Out of scope: `withOwnedChat` helper, retrying cancelled runs.

Execution follows the Phase 0–2 workflow: create branch `jdships/phase-3-interviews` off `origin/main`, commit this plan as `docs/superpowers/plans/2026-10-21-phase-3-interviews.md`, then run it **subagent-driven** (fresh implementer + reviewer per task, whole-branch final review, one fix wave), push, open PR #4. Deferred findings go to `docs/superpowers/plans/2026-10-21-phase-3-followups.md`.

## What already exists (reuse)

- MiroFish client: `report.chat({simulationId, message, history})` (`packages/mirofish/src/endpoints/report.ts:24-34`, 180 s timeout) and `simulation.interviewBatch({simulationId, interviews:[{agentId, prompt}]})`, `stop`, `closeEnv` (`endpoints/simulation.ts:62-92`). `InterviewBatchResult` is an untyped loose object (`schemas/simulation.ts:57`). Fixture `report.chat.json` exists; no interview fixture.
- Mock server serves all four routes (`packages/mirofish/mock/server.ts:270-312`) but has no "env closed" state and canned replies.
- `runs.env_state` / `env_keepalive_until` columns exist (`packages/db/src/schema/runs.ts:74-75`); `machine.ts:13-18` sets `envState:'open'` on done; nothing sets keepalive or sweeps. `apps/worker/src/loop.ts:118-131` is a plain claim loop with no timer.
- `apps/web/src/server/ui-message.ts:24-34` whitelists data part types on load; new parts must be added there.
- Streaming primitives: `createUIMessageStream`/`createUIMessageStreamResponse` from `ai`; `startRun` in `apps/web/src/server/runs.ts:56-100` is the transaction pattern (user row, assistant row at now+1 ms, chat touch).
- Client: `chat.tsx` (useChat + DefaultChatTransport, body `{uploadIds, runOptions}`), `composer.tsx` (`onSend(text, uploadIds, runOptions)`), `PromptInputSelect*` exported but unused in `components/ai-elements/prompt-input.tsx:1265-1316`, `agent-roster.tsx` cards open a Sheet with no selection hook, `message-parts.tsx` renders by part type in fixed order.
- Tests: route tests mock `@/lib/session`, `@/server/*`; engine tests use `createMemoryStore()` + `fakeClient()` in `packages/engine/src/orchestrator/test-helpers.ts` (already stubs `interviewBatch`/`closeEnv`). Root `test` script is `turbo run test --concurrency=1`.

## Global constraints

- MIT clean-room; engine never imports React/Next. Follow-ups create **no** runs, run_events or event kinds.
- New data part `data-interview`, part id `interview:<agentId>`, in `packages/engine/src/parts.ts`:
  ```ts
  InterviewDataSchema = z.object({ agentId: z.string(), agentName: z.string(), question: z.string(),
    status: z.enum(['pending','done','failed']), answer: z.string().optional(), error: z.string().optional() })
  ```
  Added to `OpinionsDataParts` and the `ui-message.ts` whitelist. No `data-env` part: env state travels on `GET /run`.
- Constants in `packages/engine/src/follow-up/keepalive.ts`: `ENV_KEEPALIVE_MS=20min`, `ENV_INTERVIEW_EXTEND_MS=10min`, `ENV_KEEPALIVE_CAP_MS=60min`, `MAX_INTERVIEW_AGENTS=5`, `CHAT_HISTORY_TURNS=10`. Worker env: `ENV_KEEPALIVE_MS` (default 1200000), `ENV_SWEEP_INTERVAL_MS` (default 60000, 0 disables).
- Keepalive: `tick` on `finished` sets `envState:'open'` and `envKeepaliveUntil = now + keepalive` in the same transition. Each interview (only when `envState==='open'`, before calling MiroFish) sets `min(max(current, now) + 10min, finishedAt + 60min)`. Sweeper selects `env_state='open' AND env_keepalive_until <= now`, calls `stop` then `closeEnv` best-effort, sets `envState:'closed'` regardless (a dead MiroFish must not keep rows open forever). Unfenced writes (run is `done`).
- Route order: 401 → 404 → 400 `invalid_body` → 400 `empty_message` → 409 `run_active` → **follow-up when `latest.status==='done'`** → else start a run. `run_finished` is removed everywhere (route, tests, client notice, README). `failed`/`cancelled` latest still start a new run.
- Body schema adds `target: z.enum(['report','agents']).default('report')`, `agentIds: z.array(z.string().min(1).max(64)).max(5).default([])`. Follow-up branch ignores `uploadIds`/`runOptions`; run branch ignores `target`/`agentIds`.
- Follow-up errors: `409 follow_up_unavailable` (done run lacks `ids.simulationId`); `409 env_closed` (target agents and `envState!=='open'`, checked before any write or MiroFish call); `400 invalid_body` (agents target with empty/duplicate ids or ids not in the run's `data-agents` roster, read from the run's assistant message row). Report chat has no env precondition.
- Stream contract (`createUIMessageStreamResponse` + `UI_MESSAGE_STREAM_HEADERS`):
  - report: `start{messageId}`, `text-start{id:'reply'}`, one `text-delta`, `text-end`, `finish`. Persisted parts `[{type:'text', text, state:'done'}]`.
  - agents: `start`, N × `data-interview` pending (before the MiroFish call), then N × final (`done`+answer or `failed`+error), `finish`. Persisted: the N final parts, never pending.
  - failure: report chat MiroFish error → delete the empty assistant row, stream `error{errorText:'follow_up_failed'}`. Interview MiroFish error → all cards `failed` (`'Agents are offline'` for api/http, `'No answer in time'` for timeout, else `'Interview failed'`), persisted, `finish`.
  - **Persist-before-stream**: final parts are written to the assistant row before the corresponding chunks are enqueued; `onFinish` is not relied on.
- Turn rows: user row (client id, `onConflictDoNothing`), assistant row `created_at = now()+1ms`, `chats.updated_at=now()`, one transaction (as `startRun`).
- `report.chat` history: `buildChatHistory(rows, {afterMessageId: run.assistantMessageId, excludeMessageId: currentUserId, maxTurns: 10})` — rows after the run's assistant row, text parts only (interview-only rows skipped), last 10 pairs.
- MiroFish: `InterviewBatchResult` → `z.object({ results: z.array(z.object({ agent_id: z.union([z.number(), z.string()]), response: z.string().optional(), error: z.string().nullish() }).loose()).optional() }).loose()`. Ids sent as numbers when `/^\d+$/`. Mapping confined to `interviewsToParts` (real shape unverified; see Risks). Mock: `SimulationRecord.envClosed`; `close-env` sets it; `interview/batch` on closed → 400 `success:false`; `report/chat` unaffected.
- New `interviews` table (migration `0002_*`): `id, chat_id fk cascade, run_id fk cascade, message_id, agent_id, agent_name, question, answer null, status, created_at` + index `(chat_id, created_at)`. One row per requested agent, inserted in the same transaction as the assistant parts update. Exists for Phase 4 quota/analytics without scanning message jsonb.
- `GET /api/chats/:id/run` adds `envState: 'none'|'open'|'closed'`, `envKeepaliveUntil: string|null`. `loadChatPage` adds `latestRun: {id, status, assistantMessageId, envState, envKeepaliveUntil} | null`.
- Client: follow-ups never bump `sendCount`, never set `watching`, never `upsertChat({runStatus})`. Composer disabled only while `submitted|streaming` or a run is active. Follow-up mode = `run.status==='done'` (live) or `latestRun?.status==='done'` (loaded). Follow-up mode hides Attach and Rounds, shows the target selector, sends `{text}` with body `{target, agentIds}`. Interview with no selection refused client-side (`Select at least one persona to interview`); env closed disables the agents option and resets to report. Notices: `env_closed` → "The personas for this conversation are offline now. You can still ask the report."; `follow_up_failed` → "The report agent did not answer. Try again."; `follow_up_unavailable` → "Follow-ups are not available for this run."
- Test DB: `TEST_DATABASE_URL` (default derived from `DATABASE_URL` with db name `xo_test`, else `postgresql://xo:xo@localhost:5432/xo_test`). `packages/config/vitest.base.ts` sets `test.env.DATABASE_URL` to `<TEST_DATABASE_URL>_<pkg>` (`xo_test_engine`, `xo_test_worker`, `xo_test_web`, `xo_test_db`) so existing `skipIf(!DATABASE_URL)` guards work, and registers `globalSetup` (`packages/db/test/global-setup.ts`): create db if missing (identifier `/^[a-z0-9_]+$/`), `pg_advisory_lock(727)`, `migrate()` from `packages/db/drizzle`, delete `queued|running` runs, unlock. Per-package DBs are what makes parallelism safe (`claimNext` and `MAX_CONCURRENT_RUNS` are per-database). Root `test` → `turbo run test`; `turbo.json` `globalEnv` + `TEST_DATABASE_URL`; CI sets it.
- Comments: none unless documenting an invariant; single-line only. All Phase 1/2 tests keep passing.

## Review focus

1. Follow-up turn durability and order: assistant row holds final parts before the client sees them; disconnect or MiroFish failure never leaves a pending card or empty row; reload renders user → assistant after the run turn. (Task 4 db tests; Task 5 loader)
2. Keepalive arithmetic exact; sweeper closes only open rows past deadline, once, and marks closed even on MiroFish errors. (Task 2, Task 3)
3. Closed env enforced with no side effects; report chat still works on a closed env. (Task 5 route tests; Task 8 e2e)
4. Interview input validated against the run's own roster; id coercion and result mapping live only in `interviewsToParts`. (Task 2, Task 4)
5. Client never mistakes a follow-up for a run; suite isolated and parallel. (Task 7, Task 1)

## Tasks

### Task 1: Isolated per-package test database, parallel `pnpm test`
- Create `packages/db/test/{global-setup.ts,test-url.ts,test-url.test.ts}`. Modify `packages/config/vitest.base.ts`, `packages/db/package.json` (export `./test/*`), root `package.json`, `turbo.json`, `.env.example`, `.github/workflows/ci.yml`, `README.md`.
- Interfaces: `deriveTestUrl(base, name)`, `testDatabaseUrl(pkg)`; `global-setup` default export per constraints (no-op when no URL resolves).
- Tests: URL derivation (query string preserved, precedence TEST_DATABASE_URL → derived → default). Verify `pnpm test` parallel twice in a row is green; without DB env DB tests skip.
- Commit: `test: isolated per-package test databases, drop test concurrency cap`

### Task 2: Engine follow-up primitives and MiroFish interview contract
- Create `packages/engine/src/follow-up/{keepalive,history,interviews,index}.ts` + tests; fixture `packages/mirofish/src/fixtures/simulation.interview-batch.mock-derived.json`.
- Modify `packages/engine/src/parts.ts` (+test), `packages/engine/src/index.ts`, `packages/mirofish/src/schemas/simulation.ts`, `packages/mirofish/mock/{state,server}.ts` (+server.test), endpoint contract test.
- Interfaces: `keepaliveAfterFinish(finishedAt, ms?)`, `extendKeepalive(run, now)`, `buildChatHistory(rows, opts)`, `interviewsToParts(result, requested)`, `pendingInterviewParts(requested)`, `mirofishAgentId(id)`, `interviewPartId(id)`.
- Tests: keepalive table (T+20m; extend from past/future current; cap; five extensions never exceed cap); history (exclusions, skip interview-only rows, last 10); interviews (numeric id matches `'3'`, missing → failed, extras ignored); mock (closed env → interview 400, report chat 200).
- Commit: `feat(engine): interview part, keepalive and history helpers; mock env-closed state`

### Task 3: Keepalive on `done`, store sweep query, `sweepEnvs`, worker timer
- Create `packages/engine/src/orchestrator/sweeper.ts` (+test). Modify `orchestrator/types.ts` (`Deps.envKeepaliveMs?`), `machine.ts` (+test), `store/{types,memory,drizzle}.ts` (`listEnvsToSweep(now, limit?)`, +tests), `packages/engine/src/index.ts`, `apps/worker/src/{loop,env,main}.ts` (+loop.test, e2e.test).
- Interfaces: `sweepEnvs(deps) → closed run ids`; worker `sweepIntervalMs` with in-flight guard, run once at start, cleared on abort.
- Tests: machine sets `envKeepaliveUntil=T+20m` (and T+1m with override); store query filters/orders/limits; sweeper calls stop+closeEnv once per run, closes on error, skips MiroFish without simulationId, second call empty; loop closes an expired run within 500 ms; e2e against the mock asserts one close-env call.
- Commit: `feat(worker): env keepalive on done and 60 s env sweeper`

### Task 4: `interviews` migration and follow-up server module
- Create `packages/db/src/schema/interviews.ts` (+exports), migration via `db:generate`, `apps/web/src/lib/mirofish.ts`, `apps/web/src/server/follow-up.ts`, `follow-up.test.ts` (mocked, `readUIMessageStream` assertions), `follow-up.db.test.ts`.
- Interfaces: `FollowUpError{code}`, `loadRoster(run)`, `createFollowUpTurn({chatId, userMessage})`, `runFollowUp({chat, run, userMessage, text, target, agentIds, now?, mirofish?}) → Response` (validate before any write; create turn; extend keepalive for interviews; stream per contract).
- Tests: chunk sequences for both targets; history excludes current message; pending chunks precede the `interviewBatch` call; keepalive update before the call; timeout → all failed + finish; report error → row deleted + error chunk; env_closed/invalid_body/unavailable thrown before writes; db ordering, interviews rows, keepalive advanced, no orphan row after failure.
- Commit: `feat(web): follow-up and interview server module with interviews table`

### Task 5: Route branch, body schema, `/run` env payload, loader, part whitelist
- Modify `apps/web/src/server/message-body.ts` (+test), `messages/route.ts` (+test; map `FollowUpError` → 400/409), `run/route.ts` (+test), `server/chat-page.ts` (+test), `server/ui-message.ts` (+test), `modules/chat/use-run-status.ts` (passthrough env fields).
- Tests: defaults/limits on body; done → `runFollowUp` called, `startRun` not; error mapping; failed latest → startRun; no `run_finished` references remain; `/run` ISO deadline; loader returns follow-up rows in order with `latestRun`; whitelist accepts valid interview part, drops invalid.
- Commit: `feat(web): route follow-ups to the report agent or interviews; env state on /run`

### Task 6: Interview selection context, selectable roster, interview cards
- Create `apps/web/src/modules/chat/interview-selection.tsx` (+test), `parts/interview-card.tsx` (+test). Modify `parts/agent-roster.tsx` (+test), `message-parts.tsx` (+test).
- Interfaces: `InterviewSelectionProvider({enabled, max, children})`, `useInterviewSelection()` (null outside a provider so existing tests pass); roster cards `aria-pressed` toggles when enabled, separate "About <name>" button opens the sheet; `InterviewCard` (Shimmer pending, `MessageResponse` done, Alert failed); `MessageParts` dedupes interview parts by agentId, last wins, `data-part="interviews"`.
- Commit: `feat(web): selectable persona roster and interview cards`

### Task 7: Composer target selector, chips, env badge, chat wiring
- Create `composer/target-selector.tsx`, `modules/chat/env-badge.tsx` (+test), `modules/chat/use-env-status.ts` (+test). Modify `composer/composer.tsx` (+test), `chat.tsx` (+test), `app/(chat)/c/[id]/page.tsx` (pass `latestRun`).
- Interfaces: `TargetSelector({value, onChange, agentsDisabled})` on `PromptInputSelect*`; `Composer` props `{mode:'run'|'followUp', envOpen, onSend(text, submit: ComposerSubmit)}` with `ComposerSubmit = {kind:'run', uploadIds, runOptions} | {kind:'followUp', target, agentIds}`; chips in `PromptInputHeader` from selection; selection cleared after send; target resets to report when env closes. `useEnvStatus(chatId, {seed, refreshKey})` refetches `/run` on key change, ticks every 30 s, flips closed locally past deadline. `EnvBadge` "Agents available for N min" / "Agents offline", `role="status"`. `chat.tsx`: `followUpMode`, provider wraps the list, `onFinish` bumps env refresh in follow-up mode, `onError` maps the three new codes, drops `run_finished`.
- Tests: composer modes; refusal with no chips; chips cleared; agents disabled when env closed; badge text; env hook seed/refetch/expiry; chat does not poll `/run` or `upsertChat` on follow-up send.
- Commit: `feat(web): follow-up composer with target selector, persona chips and env badge`

### Task 8: End-to-end verification and docs
- CLI happy path against mock + worker + web: report follow-up SSE; `/run` shows open + deadline ≈ finishedAt+20m; interview with 3 ids → 3 pending then 3 done; deadline +10m; 3 `interviews` rows.
- CLI fail/close: 6 ids → 400; unknown id → 400; SQL-expire env → sweeper closes within 60 s (mock logs one stop + one close-env); interview → 409 `env_closed`; report follow-up still 200; mock stopped → `follow_up_failed` and no empty assistant row.
- Browser: composer unlocks after done; ask → reply persists across reload in order; interview mode, three pressed cards, chips, send → cards shimmer then fill; badge grows after interview; expire → badge offline, option disabled, report still answers. Screenshot `.context/phase3-followups.jpg`.
- Gates: `pnpm typecheck`, parallel `pnpm test` twice, `pnpm --filter web build`, CI green.
- Docs: README (follow-ups, interviews, keepalive, env vars, TEST_DATABASE_URL; remove the run_finished sentence), tick the test-DB note in phase-2-followups, `.env.example`, create `2026-10-21-phase-3-followups.md`.
- Commit: `docs: phase 3 follow-ups, interviews and env keepalive`

## Verification (end to end)

1. `pnpm typecheck && TEST_DATABASE_URL=postgresql://xo:xo@localhost:55432/xo_test pnpm test` (parallel, twice) and `pnpm --filter web build` all exit 0.
2. Run mock MiroFish + worker + `pnpm dev`; complete a run with 1 round; then drive the Task 8 CLI and browser checks.
3. Final whole-branch review (most capable model) + one fix wave; push; `gh pr create --base main`; CI green.

## Open risks

- Real MiroFish interview request/response shape is copied from the mock, not captured. First real run must capture `simulation.interview-batch.json`; only `interviewsToParts` and the mock should need changes. Error code MiroFish returns for a closed env is also a guess; the route degrades to failed cards either way.
- Report chat on a closed env is assumed to work (report agent reads from Zep/graph). Verify on first real run.
- Vercel: 200 s interview + DB fits `maxDuration=300` only on plans honouring it; Hobby caps at 60 s. Document in Phase 4 `docs/hosting.md`.
- Concurrent follow-ups in one chat are not serialised. Chat delete does not close the env. Both noted for Phase 4.
- Vitest `globalSetup` + `test.env` propagation and Turbo strict env mode: verify in CI first.
