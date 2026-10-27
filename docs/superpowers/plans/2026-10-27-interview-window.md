# Interview Window Before the Report — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A run started with "Pause for interviews before the report" ticked stops after the simulation rounds with the personas online for a bounded window, lets the user interview them (answers arriving one by one, executed by the worker), and generates the report on demand or when the window ends; unticked runs are unchanged.

**Architecture:** A new orchestrator stage `interviews` sits between `sim_run` and `report`. Interview questions are rows in the existing `interviews` table (plus a `question_id`), written by the web route and executed by the worker inside the stage's poll, one persona per MiroFish call; their lifecycle is projected through two new event kinds (`interview_window`, `interview`) on the run's event log, so streaming, reload and reattach need no new path. Environment lifetime is owned by the stage (expiry, "Generate report", dead-environment detection, close-and-wait with a deadline); `fail()` and cancel both clean the environment, and the sweeper only touches finished runs. The post-run interview UI from Phase 3 is removed.

**Tech Stack:** unchanged. Drizzle migration `0004` adds `interviews.question_id`.

**Spec:** `docs/superpowers/specs/2026-10-27-interview-window-design.md` (binding). Inputs: `docs/superpowers/plans/2026-10-23-phase-5-followups.md` "Real MiroFish findings" and "Open".

## Global Constraints

- MIT clean-room; HTTP only to MiroFish; engine never imports React/Next; `@xo/engine/parts` Postgres-free. Comments: none unless an invariant; single-line.
- `STAGES` becomes `['ontology','graph_build','sim_create','sim_prepare','sim_run','interviews','report','finished']`. `EVENT_KINDS` gains `interview_window` (partId `interview_window`) and `interview` (partId `interview:<interviewRowId>`). Parts: `InterviewWindowDataSchema = z.object({ until: z.string().nullable(), personaCount: z.number().int(), closed: z.boolean(), reason: z.enum(['report_requested','expired','environment_stopped']).optional() })`; `InterviewDataSchema` gains `id: z.string()` and `questionId: z.string()` (existing fields kept). `AgentsDataSchema` gains `platform: z.enum(['twitter','reddit']).optional()` set at prepare time from the simulation config's first platform (`config/realtime`; fall back to `'reddit'`, MiroFish's default).
- `RunConfig.pauseForInterviews?: boolean`. `RunCursors` gains `interviewsStartedAt?: string` (ISO), `reportRequested?: boolean`, `envCheckedAt?: string`, `closeWaitStartedAt?: string`.
- Constants (`packages/engine/src/follow-up/keepalive.ts`): `INTERVIEW_WINDOW_MS = 20 * 60_000`, `INTERVIEW_EXTEND_PER_PERSONA_MS = 5 * 60_000`, `INTERVIEW_WINDOW_CAP_MS = 60 * 60_000`, `ENV_CHECK_INTERVAL_MS = 30_000`, `CLOSE_WAIT_DEADLINE_MS = 3 * 60_000`, `INTERVIEW_MIROFISH_TIMEOUT_S = 240`, `INTERVIEW_CLIENT_TIMEOUT_MS = 270_000`. The existing post-run constants stay for the (now unused) follow-up path only if still referenced; remove dead ones.
- `sim_run`: when both platforms are complete and `runner_status === 'running'`: if `run.config.pauseForInterviews` → `advance(... 'sim_run', 'interviews')` without closing the env; else → `closeEnvAndWait` (existing behaviour) then `advance` to `report`.
- `closeEnvAndWait(run, deps)` (new `packages/engine/src/orchestrator/env.ts`): persists `cursors.envCloseRequested`/`closeWaitStartedAt`, calls `closeEnv` once, then on subsequent ticks polls `runStatus` until `completed|stopped`; if `now - closeWaitStartedAt > CLOSE_WAIT_DEADLINE_MS` throws a `MiroFishError`-like `StageError` with code `env_stuck` (non-retriable) so `fail()` records `error.code = 'env_stuck'`. Same file exports `cleanupEnv(run, deps): Promise<void>` = best-effort `stop` then `closeEnv` with errors logged, used by the worker's cancel path and by `fail()` when `stage ∈ {sim_run, interviews, report}` and `ids.simulationId` exists.
- Stage `interviews` (`stages/interviews.ts`): `enter`: emit `stage{interviews, running, 'Personas online'}`, `interview_window { until: now+INTERVIEW_WINDOW_MS, personaCount: cursors.lastAgentCount ?? 0, closed: false }`, update `envState:'open'`, `envKeepaliveUntil`, `cursors.interviewsStartedAt`. `poll` order: (1) pending interview rows for the run → execute the first (one persona): `interviewBatch({ simulationId, interviews: [{ agentId: mirofishAgentId(row.agentId), prompt: row.question }], platform: agentsPlatform, timeout: INTERVIEW_MIROFISH_TIMEOUT_S }, { timeoutMs: INTERVIEW_CLIENT_TIMEOUT_MS })` → row `done`+answer or `failed`+message (`'Agents are offline'` for api/http, `'No answer in time'` for timeout, else `'Interview failed'`), emit `interview{..., status}`; return (one persona per tick). (2) if `cursors.reportRequested || envKeepaliveUntil <= now` → `closeEnvAndWait`; when done: emit `interview_window { ...closed: true, until: null, reason }` (reason `report_requested` or `expired`), `stage{interviews, done}`, `advance` to `report`. (3) else if `now - (envCheckedAt ?? interviewsStartedAt) >= ENV_CHECK_INTERVAL_MS` → `runStatus`; if `runner_status` not in `running|paused` → fail all pending rows with `'Agents are offline'` (emit `interview` events), emit window closed with `reason:'environment_stopped'`, `stage done`, advance to `report` (no close-and-wait); else update `envCheckedAt`. (4) else idle.
- Store (`RunStore`): `listPendingInterviews(runId): Promise<InterviewRow[]>` (status `pending`, ordered by `created_at, id`), `updateInterview(id, patch: { status; answer?; error? }): Promise<void>`, `createInterviews(rows: NewInterview[]): Promise<InterviewRow[]>`; memory + drizzle; `queuePosition` unchanged; `listEnvsToSweep` adds `status = 'done'`.
- `prepareRetry`: a run whose `error.stage` is `interviews`, or whose `error.code` is `env_stuck`, re-enters at `report` with `cursors.envCloseRequested` cleared and `reportRequested: true`.
- Web body schema: `runOptions.pauseForInterviews: z.boolean().default(false)`; env `DEMO_ALLOW_PAUSE` (`'1'|'0'`, default `'1'`) in `env.schema.ts`, `Limits.allowPause`; when `allowPause` is false the route forces `pauseForInterviews=false` and the checkbox is hidden. `startRun` stores `config.pauseForInterviews`.
- Route `POST /api/chats/:id/messages`, new branch BEFORE the `run_active` check: active run with `stage === 'interviews'` and `body.target === 'agents'` → `createInterviewQuestion({ run, agentIds, text })` (new `apps/web/src/server/interview-window.ts`): validate ids against the roster (1..5, unique, present) → `400 invalid_body`; refuse when `run.cursors.reportRequested` → `409 report_requested`; refuse when `envKeepaliveUntil <= now` → `409 window_closed`; else insert rows (`question_id = generateId()`, `status 'pending'`, `message_id = run.assistantMessageId`), append one `interview{ status:'pending' }` event per row, extend `envKeepaliveUntil = min(max(current, now) + INTERVIEW_EXTEND_PER_PERSONA_MS × n, interviewsStartedAt + INTERVIEW_WINDOW_CAP_MS)`, and return `202 { questionId, interviewIds }` (NOT a stream; the client reattaches). Any other message while the run is in `interviews` → `409 run_paused` (text to the report is not allowed during the pause).
- Route `POST /api/chats/:id/run/report`: 401/404 as others; active run in stage `interviews` → set `cursors.reportRequested = true` (unfenced), `202 { ok: true }`; otherwise `409 run_not_paused`.
- `GET /api/chats/:id/run` adds `pausedAhead: boolean` for queued runs (true when any running run is in stage `interviews`); `data-queue` part gains `pausedAhead?: boolean`.
- Client: `RunOptions` gets a checkbox `Pause for interviews before the report` (hidden when `limits.allowPause === false`); `ComposerSubmit` run variant carries `runOptions.pauseForInterviews`. `InterviewWindowCard` (run turn) renders "N personas are online until HH:MM" (local time from `until`), a countdown (minutes), the **Generate report** button (POSTs `/run/report`, then shows "Generating report…" until the stage changes), and after close "Personas offline" with the reason. Interview parts group by `questionId` under the card: question heading, one `InterviewCard` per persona. Composer `interview` mode when `/run` reports `stage === 'interviews'` and `reportRequested` is false: target fixed to personas, roster selectable, chips, no attach/rounds; submit POSTs `/messages` with `{ target:'agents', agentIds, message }` then calls `resumeStream()`; refusal codes map to notices: `window_closed` → "The interview window has closed. The report is being generated."; `report_requested` → "The report is being generated; no more interviews for this run."; `run_paused` → "Pick personas to interview, or generate the report." Post-run: `EnvBadge` renders nothing, the post-run `agents` target is removed, `machine.ts` sets `envState:'closed'` with no keepalive on `done`. Pipeline timeline shows `interviews` as "Personas online" (done → "Personas offline") only when its events exist. `QueueCard` adds "A run is paused for interviews; yours starts when it finishes." when `pausedAhead`.
- `ui-message.ts` whitelists `data-interview_window`; `materialiseRun` needs no change (generic).
- Mock (`packages/mirofish/mock/server.ts`): `MOCK_INTERVIEW_DELAY_MS` (default 1500) per interview call; `interview/batch` honours `timeout` only by validating it; unchanged otherwise.
- Hosted/demo docs: `DEMO_ALLOW_PAUSE=0` in the hosted env list and runbook.
- Keys only in local `.env.selfhost`; never in commits or reports.

## Review Focus

1. An unticked run is byte-for-byte the same as today: no `interview_window` part, no `interviews` stage event, same close-env-then-report sequence and timing. (Task 1 machine test; Task 7 real unticked run)
2. Window expiry with interviews still pending completes them before closing, then closes exactly once. (Task 1 machine test with two pending rows and an expired keepalive)
3. A dead environment is detected within one check interval, pending rows fail with "Agents are offline", the card shows "Personas offline", and the report still generates. (Task 1 machine test; Task 7 kill MiroFish mid-window on the mock stack)
4. "Generate report" while a persona is being interviewed finishes that persona, refuses new questions, then closes. (Task 1 machine test; Task 4 route tests; Task 7)
5. Reload mid-window restores the card, countdown, grouped answers and composer mode from the DB alone. (Task 5 component tests on replayed parts; Task 7 browser reload)

---

### Task 1: Engine — stage `interviews`, env helper, parts/events, store, retry, fail cleanup, sweeper filter

**Files:**
- Create: `packages/engine/src/orchestrator/env.ts` (+ `env.test.ts`), `packages/engine/src/orchestrator/stages/interviews.ts`
- Modify: `packages/engine/src/parts.ts` (+test), `events.ts` (+test), `follow-up/keepalive.ts` (+test), `orchestrator/stages/{sim-run,sim-prepare,index}.ts`, `orchestrator/{machine,fail,retry,cancel,types}.ts`, `orchestrator/mirofish-map.ts` (platform on agents), `store/{types,memory,drizzle}.ts` (+tests), `orchestrator/sweeper.ts` (+test), `orchestrator/test-helpers.ts` (fake client: `configRealtime`, interview rows), `packages/db/src/schema/interviews.ts` (`question_id text`), migration `0004_*` via `db:generate`, `apps/worker/src/loop.ts` (use `cleanupEnv`; include `interviews` stage)
- Test: `machine.test.ts` cases listed below; `retry.test.ts`; `store/*.test.ts`; `sweeper.test.ts`; `env.test.ts`

**Interfaces:**
- Produces everything named in Global Constraints for the engine: `closeEnvAndWait`, `cleanupEnv`, `interviews` stage handler, store methods, parts/events, `prepareRetry` mapping, constants.
- `InterviewRow` type = `Interview` from `@xo/db` (with `questionId`).

- [ ] **Step 1: Write failing tests** — parts/events: new schemas, kinds, partIds. keepalive: extension formula with cap from `interviewsStartedAt`. env: `closeEnvAndWait` calls closeEnv once across ticks; `stopping` then `completed` resolves; deadline → `env_stuck`; `cleanupEnv` swallows errors. machine: (a) unticked run → identical event sequence to the current test (**RF1**); (b) ticked run → after rounds: stage `interviews` running + `interview_window{closed:false}` + `envState 'open'`, no closeEnv call; (c) one pending row → one `interviewBatch` call with `platform` and `timeout: 240`, row done, `interview{done}` event, window extended not required here; (d) `reportRequested` with one pending row → row completes first, then closeEnv, window closed `report_requested`, stage done, advance to report (**RF4**); (e) expired keepalive with two pending rows → both complete over two ticks, then close (**RF2**); (f) idle 30 s check sees `runner_status 'stopped'` → pending rows failed `'Agents are offline'`, window `environment_stopped`, advance to report without closeEnv (**RF3**); (g) `fail()` in `interviews` calls `cleanupEnv`; retry: `error.stage 'interviews'` → stage `report`, `reportRequested true`; `env_stuck` → same. store: pending list ordering, update, create; `listEnvsToSweep` ignores `running` rows with past keepalive. mirofish-map: `platform` on agents part from `configRealtime`.
- [ ] **Step 2: Run** `pnpm --filter @xo/engine test` → FAIL. **Step 3: Implement.** **Step 4: Run** engine + db + worker tests with `TEST_DATABASE_URL` → PASS; typecheck. **Step 5: Commit** `feat(engine): interview window stage, env lifecycle helper, interview events`

---

### Task 2: MiroFish client and mock

**Files:**
- Modify: `packages/mirofish/src/endpoints/simulation.ts` (`interviewBatch` input gains `platform?: 'twitter'|'reddit'`, `timeout?: number`; `configRealtime(simulationId)` if missing), `src/schemas/simulation.ts` (config schema `platform_configs`/first platform, loose), `mock/server.ts` (`MOCK_INTERVIEW_DELAY_MS`; `interview/batch` validates `timeout`/`platform`; `config/realtime` returns a platform), `mock/server.test.ts`, `src/endpoints/endpoints.test.ts`

- [ ] **Step 1: Write failing tests** — client sends `platform` and `timeout` in the body when given; mock delays each interview by `MOCK_INTERVIEW_DELAY_MS`; mock rejects an invalid platform with 400.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `pnpm --filter @xo/mirofish test` → PASS. **Step 5: Commit** `feat(mirofish): interview platform/timeout, config realtime, mock interview delay`

---

### Task 3: Worker e2e on the mock with the pause

**Files:**
- Modify: `apps/worker/src/e2e.test.ts` (new case: `pauseForInterviews: true` → run reaches stage `interviews`; insert two pending interview rows via the store; set `reportRequested` → rows complete, env closed once, report generated, run `done`, `envState 'closed'`; assert `mock.calls['POST /api/simulation/interview/batch'] === 2` and close-env once), `apps/worker/src/loop.ts` if anything is needed for stage ticks while idle (the loop already ticks every `pollMs`).

- [ ] **Step 1: Write the failing e2e case.** **Step 2: Run** `TEST_DATABASE_URL=... pnpm --filter worker test` → FAIL. **Step 3: Fix wiring.** **Step 4: Run** → PASS. **Step 5: Commit** `test(worker): e2e interview window on the mock`

---

### Task 4: Web server — body option, limits, interview question route branch, report route, `/run` fields, whitelist

**Files:**
- Create: `apps/web/src/server/interview-window.ts` (+ `.test.ts`, `.db.test.ts`), `apps/web/src/app/api/chats/[id]/run/report/route.ts` (+test)
- Modify: `apps/web/src/server/message-body.ts` (+test), `env.schema.ts` (+test), `server/limits.ts` (+test), `server/runs.ts` (`startRun` stores `pauseForInterviews`; force false when `!allowPause`), `app/api/chats/[id]/messages/route.ts` (+test), `app/api/chats/[id]/run/route.ts` (+test: `pausedAhead`, `stage`, `reportRequested`), `server/ui-message.ts` (+test), `modules/chat/use-run-status.ts` (passthrough `reportRequested`, `pausedAhead`), store `queuePosition`/`pausedAhead` query in `packages/engine/src/store/*` (`hasPausedRunning(): Promise<boolean>`)

**Interfaces:**
- `createInterviewQuestion({ run, agentIds, text, now? }): Promise<{ questionId: string; interviewIds: string[] }>`; throws `InterviewWindowError` with `code: 'invalid_body' | 'report_requested' | 'window_closed'`.
- `POST /run/report` per Global Constraints; `/run` payload adds `reportRequested: boolean`, `pausedAhead: boolean`.

- [ ] **Step 1: Write failing tests** — body default false; `DEMO_ALLOW_PAUSE=0` → `allowPause false` and `startRun` receives false even when the body says true; messages route: paused run + agents target → 202 with ids and NO stream headers, `startRun` not called; paused run + report target → 409 `run_paused`; `reportRequested` → 409; expired → 409 `window_closed`; bad ids → 400; db test: rows inserted with shared `questionId`, `interview` pending events appended with `partId interview:<id>`, keepalive extended by 5 min × n, capped; report route: 202 sets `reportRequested`, 409 otherwise; `/run` fields; whitelist accepts `data-interview_window`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `pnpm --filter web test` with `TEST_DATABASE_URL`, typecheck → PASS. **Step 5: Commit** `feat(web): pause option, interview questions during the window, generate-report route`

---

### Task 5: Web client — checkbox, window card, grouped interview cards, composer interview mode, post-run cleanup

**Files:**
- Create: `apps/web/src/modules/chat/parts/interview-window-card.tsx` (+test)
- Modify: `composer/run-options.tsx` (+test; checkbox), `composer/composer.tsx` (+test; `interview` mode; `ComposerSubmit` run variant gains `pauseForInterviews`; interview variant unchanged), `chat.tsx` (+test; derive mode from `run.stage === 'interviews' && !reportRequested`; plain POST + `resumeStream()` for interview questions; notices; remove post-run agents target and badge), `message-parts.tsx` (+test; window card then interview groups by `questionId`), `parts/pipeline-timeline.tsx` (+test; label), `parts/queue-card.tsx` (+test; pausedAhead text), `env-badge.tsx` (renders nothing when not open; remove from post-run), `target-selector.tsx` (interview mode fixed), `interview-selection.tsx` (enabled in interview mode)

- [ ] **Step 1: Write failing tests** — run-options: checkbox present/hidden by `allowPause`, value in `onSend`; window card: open text with persona count and time, countdown from `until`, Generate report click POSTs `/run/report` and shows "Generating report…", closed state texts per reason; message-parts: parts replayed from a fixture (window open + two questions × two personas, mixed statuses) render card, two groups, headings, cards (**RF5**); chat: in interview mode a send POSTs `/messages` with `{ target:'agents', agentIds, message }` and then calls `resumeStream` once, never `sendMessage`; notices for the three codes; after `done` no badge and no agents target; timeline label; queue card text; axe checks on the new card.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** web tests, typecheck, lint, build → PASS. **Step 5: Commit** `feat(web): interview window card, pause checkbox, interview composer mode; remove post-run interviews`

---

### Task 6: Docs

**Files:**
- Modify: `README.md` (feature description replaces the "unavailable after a run" note), `docs/hosting.md` (`DEMO_ALLOW_PAUSE`, window semantics, worker slot note), `docs/hosting-runbook.md` (`DEMO_ALLOW_PAUSE=0` for the demo), `infra/docker/*.yml` / `.env.selfhost.example` (`DEMO_ALLOW_PAUSE`, `MOCK_INTERVIEW_DELAY_MS`), `docs/superpowers/plans/2026-10-23-phase-5-followups.md` (resolve the interview Open items; add the upstream-issue link placeholder)

- [ ] **Step 1:** Write; `grep -rn "unavailable after" README.md docs` → none. **Step 2: Commit** `docs: interview window`

---

### Task 7: Verification — mock stack, then real keys

- [ ] **Step 1 (mock, `up-mock.sh`, `MOCK_SPEED=20 MOCK_INTERVIEW_DELAY_MS=3000`):** ticked run → window card appears with countdown; interview one persona → pending card then answer (~3 s); interview two personas → answers trickle; reload mid-window → card, countdown, groups and composer mode restored (**RF5**); Generate report → "Generating report…", then report; follow-up works; `envState 'closed'` and no badge after done. Unticked run → no window, report as before. Kill the mock container mid-window → within 30 s card shows offline, pending cards fail, report generates (**RF3**). Screenshot `.context/interview-window-mock.jpg`.
- [ ] **Step 2 (real keys, `up.sh`, local `.env.selfhost`):** ticked run, 1 round: window card; interview one persona (record time); interview two personas (record times, confirm `platform`/`timeout` sent and no 504); Generate report; report follow-up. Then an unticked 1-round run: timing unchanged (~6 min). Record cost-relevant counts (interview calls) and any mock/real mismatch; fix with tests if found. Screenshot `.context/interview-window-real.jpg`. Keys never printed.
- [ ] **Step 3:** Gates: lint, licences, typecheck, full tests, web build, compose test. Follow-ups doc updated. Commit `docs: interview window verification notes`.

## Open risks

- One persona per MiroFish call at ~3 minutes each means a 5-persona question takes about 15 minutes; the UI must make that expectation visible (the card says "about 3 minutes per persona").
- Whether a persona can be interviewed repeatedly without degrading is untested until Task 7.
- The hosted demo holds the single worker slot during a pause; `DEMO_ALLOW_PAUSE=0` is the mitigation until MiroFish concurrency above 1 is proven.
- Report quality may differ when the environment has been held open for interviews before the report (the report agent reads the same graph and posts, so no difference is expected).
