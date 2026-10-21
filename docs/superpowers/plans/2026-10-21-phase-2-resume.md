# Xenet Opinions Phase 2: Reload-Resume, Cancel, Retry, History — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A run survives everything the browser does to it: reloading, closing the tab, switching devices, or the 280 s stream cap all reattach to the same assistant turn without duplicates; the user can cancel a run or retry a failed one; and a sidebar lists, renames and deletes conversations.

**Architecture:** `run_events` stays the source of truth. A new `GET /api/chats/:id/stream` serves the same replay-from-seq-0 tail the POST serves, so `useChat({ resume })` and a small reattach loop recover any interrupted stream. The page loader omits the in-flight assistant message so the replay rebuilds it. Cancel is a terminal `cancelled` event plus a status flip; worker writes are fenced on `status='running' AND lease_owner`, so a late worker write after a cancel is rejected rather than overwriting it. Retry creates a NEW run row and assistant message, copies the old run's non-terminal events and MiroFish ids, and re-enters at the failed stage.

**Tech Stack:** Phase 1 stack unchanged (`ai` 7.0.143, `@ai-sdk/react` 4.0.147, Next 16.4, Drizzle 0.45.4). AI Elements/shadcn components installed from `https://elements.ai-sdk.dev/api/registry/<name>.json` (the shadcn-hosted docs pages do not yet serve registry JSON for these components; re-check at Phase 4). shadcn `sidebar`, `dialog`, `alert-dialog`, `dropdown-menu`, `input` already present or added via `pnpm dlx shadcn@4.22.1 add`.

**Spec:** `docs/superpowers/specs/2026-10-19-xenet-opinions-design.md` (Architecture: long-running job handling; Phase 2). Binding design inputs: `docs/superpowers/plans/2026-10-20-phase-1-followups.md` "Phase 2 design notes".

## Global Constraints

- MIT, clean-room; no MiroFish or TurboStarter code. Engine never imports React/Next.
- New event kind exactly `cancelled` (payload `{ stage: Stage; message: string }`, partId `null`); new `StageStatus` value exactly `cancelled`. Projector maps `cancelled` → `[{ type: 'abort', reason: message }, { type: 'finish' }]` and the tail stops after it. The cancelled run's current stage also gets a `stage` event with `status: 'cancelled'` (partId `stage:<name>`) BEFORE the `cancelled` event, in the same transaction.
- Run status set unchanged: `queued | running | done | failed | cancelled`.
- Fencing: `RunStore.update`, `appendEvent`, `transition` accept an optional `fence?: { owner: string }`; when present the write requires `status = 'running' AND lease_owner = $owner` and throws `FenceError` (`name: 'FenceError'`, `code: 'run_fenced'`) if no row matched. The worker passes `fence` on every write via `Deps.fence`. Routes write without a fence. `claimNext` is unchanged (never claims `cancelled`).
- Cancel semantics: `POST /api/chats/:id/run/cancel` on a `queued|running` run → in one transaction: `stage(cancelled)` + `cancelled` events, `status 'cancelled'`, `finishedAt`, and `lease_until = now()`; returns 200 `{ runId }`. On `done|failed|cancelled` → 409 `{ error: 'run_not_active' }`. No run → 404. The worker, on its next fenced write failing with `FenceError`, re-reads the run; if `cancelled` and `ids.simulationId` exists and the stage was `sim_run|report`, best-effort `mirofish.simulation.stop` then `closeEnv`, logs, and drops the run.
- Retry semantics: `POST /api/chats/:id/run/retry` only when the latest run is `failed` (else 409 `{ error: 'run_not_failed' }`; active run → 409 `run_active`). Creates a NEW assistant message (empty parts, `created_at = now()`) and a NEW run with: `config` copied; `ids` copied; `stage` = the failed stage (`error.stage`); `cursors` = `{ agentLogLine, lastPostsOffset*, reportEventCount, feed, reportSections }` copied but `retries, startAttempts, idlePolls` reset to 0 and `simStarted`, `startAcked` removed; `status 'queued'`. Then copies every event of the old run EXCEPT `stage` events for the failed stage, `error`, `done`, `cancelled` into the new run (new seq, same partIds), and appends `stage { <failedStage>, status: 'pending', message: 'Retrying' }`. Returns 201 `{ runId, assistantMessageId }`. The old assistant message keeps its failed parts (history stays honest).
- `GET /api/chats/:id/stream`: 401/404 as the messages route; active run → `createUIMessageStreamResponse({ stream: tailRunAsUIMessageStream({ store, runId, messageId: assistantMessageId, maxDurationMs: 280_000, signal: request.signal }), headers: UI_MESSAGE_STREAM_HEADERS })`; no active run → `204`. `maxDuration = 300`, `runtime = 'nodejs'`.
- `GET /api/chats/:id/run`: `{ status: 'none' }` or `{ runId, status, stage, assistantMessageId, lastSeq }` (cheap; used by the reattach poll every 5 s).
- Page loader: when an active run exists, `initialMessages` EXCLUDES the row whose id is the run's `assistantMessageId`, and `<Chat resume>` is true. For terminal runs whose assistant row has empty `parts` (worker died before materialising), the loader calls `materialiseRun(runStore, run.id)` once and uses the result.
- Client: `DefaultChatTransport({ api, prepareSendMessagesRequest, prepareReconnectToStreamRequest: ({ id }) => ({ api: \`/api/chats/${id}/stream\` }) })`; `useChat({ resume })` (default `resumeStreamIsReplay: true` — our tail always replays from seq 0). `useRunStatus(chatId, enabled)` polls `GET /api/chats/:id/run` every 5000 ms while a run is active; when the poll says active but `status === 'ready'` and no stream is open, call `resumeStream()`; stops polling on terminal.
- Lease: `RunStore.releaseLease(id, owner)` sets `lease_until = now()` when `lease_owner = $owner AND status = 'running'`. Worker calls it for its current run on abort (SIGINT/SIGTERM) and renews the lease on a heartbeat every `leaseMs / 3` while a tick is in flight (so a 600 s ontology call keeps the lease).
- Sidebar: `GET /api/chats` → `{ chats: [{ id, title, updatedAt, runStatus }] }` ordered by `updated_at desc` (owned only); `PATCH /api/chats/:id { title }` (1..120 chars) → 200; `DELETE /api/chats/:id` → 204 (cascade removes messages/runs/events/uploads; storage blobs deleted best-effort; an active run is cancelled first). `startRun` sets `chats.title` to the first 60 chars of the question when the title is empty, and touches `updated_at` on every message.
- Error bodies: existing plus `run_not_active`, `run_not_failed`, `invalid_body` for bad titles.
- Comments: none unless they document an invariant the code cannot express; single-line only. All Phase 1 tests keep passing.

## Review Focus

1. Reload mid-run must show exactly one assistant turn with the live cards, never a duplicated or stale one. (tests in Task 4: loader omits the in-flight row; Task 3: replay from seq 0 after a partial first stream yields identical parts)
2. Cancel while the worker is mid-tick must stick: the worker's late `transition`/`update` is rejected and the run stays `cancelled` with the `cancelled` event last. (tests in Task 2 store fence; Task 6 worker handles `FenceError`)
3. Retry of a failed run must not re-run completed stages: no second `generateOntology`/`build`/`create` call when those ids exist, cards from the old run visible in the new turn. (tests in Task 5 retry copies events/ids; Task 1 machine resume tests already cover hasEntered)
4. `GET /stream` or `/run` for a chat the user does not own must be 404 JSON, never a stream or a run id. (tests in Task 3)
5. Deleting a chat with an active run must cancel it first and leave no orphan rows or blobs the app can still reach. (tests in Task 7)

---

### Task 1: `cancelled` event kind, stage status, projector mapping

**Files:**
- Modify: `packages/engine/src/parts.ts` (StageStatus adds `cancelled`), `packages/engine/src/events.ts` (`EVENT_KINDS` adds `cancelled`; payload schema `{ stage: StageSchema, message: z.string() }`; `partIdFor('cancelled') === null`), `packages/engine/src/projector/to-chunks.ts`, `packages/engine/src/projector/tail.ts` (terminal kinds now `done | error | cancelled`), `apps/web/src/modules/chat/parts/pipeline-timeline.tsx` (grey "Cancelled" label + icon; sr-only text)
- Test: extend `parts.test.ts`, `to-chunks.test.ts`, `tail.test.ts`, `pipeline-timeline.test.tsx`

**Interfaces:**
- Produces: `cancelRun(store, runId, now): Promise<Run>` in `packages/engine/src/orchestrator/cancel.ts` — `store.transition(runId, { status: 'cancelled', finishedAt: now, error: null }, [stage(cancelled for run.stage, message 'Cancelled by user'), cancelled { stage, message }])` with NO fence; also sets the lease to released via a new `RunPatch` field `leaseUntil` (add `leaseUntil` to `RunPatch`). Exported from `@xo/engine`.

- [ ] **Step 1: Write failing tests** — `to-chunks`: `cancelled` → `[{type:'abort', reason:'Cancelled by user'}, {type:'finish'}]`; `tail`: a `cancelled` event ends the stream after `abort`+`finish`; `parts`: `StageDataSchema` accepts `status:'cancelled'`; timeline renders "Cancelled" text for that status; `cancel.test.ts`: on a running run at `sim_run`, events end `[stage:sim_run:cancelled, cancelled]`, status `cancelled`, `leaseUntil` in the past.
- [ ] **Step 2: Run** `pnpm --filter @xo/engine test` and `pnpm --filter web test` → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; typecheck. **Step 5: Commit** `feat(engine): cancelled event kind and cancelRun`

---

### Task 2: Fenced writes and lease release in the store

**Files:**
- Modify: `packages/engine/src/store/types.ts` (`FenceError`, `fence?` param on `update`/`appendEvent`/`transition`; `releaseLease(id, owner): Promise<boolean>`), `store/memory.ts`, `store/drizzle.ts`, `orchestrator/types.ts` (`Deps.fence?: { owner: string }`), `orchestrator/emit.ts` + every `store.update/transition/appendEvent` call inside `orchestrator/**` passes `deps.fence`
- Test: `store/memory.test.ts`, `store/drizzle.test.ts` (fence cases), `orchestrator/machine.test.ts` (one test: `deps.fence = { owner: 'w1' }` and the memory store's run has `leaseOwner: 'w2'` → first tick throws `FenceError`, no events written)

**Interfaces:**
- `FenceError extends Error { code: 'run_fenced'; name: 'FenceError' }` exported from `@xo/engine`.
- Drizzle: fence adds `and(eq(runs.status,'running'), eq(runs.leaseOwner, owner))` to the `UPDATE ... RETURNING` (and to the locking select in `transition`/`appendEvent`); zero rows → throw `FenceError` and roll back. Memory: same check before mutating.

- [ ] **Step 1: Write failing tests** — fenced `update` by the wrong owner throws and changes nothing; fenced `transition` by the right owner works; after `cancelRun`, a fenced `transition` from the previous owner throws (**Review Focus 2**); unfenced writes unchanged; `releaseLease` true/false by owner and status.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** both stores + machine (with `DATABASE_URL`) → PASS. **Step 5: Commit** `feat(engine): fenced run writes and lease release`

---

### Task 3: `GET /stream`, `GET /run`, and resume tail tests

**Files:**
- Create: `apps/web/src/app/api/chats/[id]/stream/route.ts`, `apps/web/src/app/api/chats/[id]/run/route.ts`
- Modify: `packages/engine/src/projector/tail.ts` (floor `pollMs` at 1; no behaviour change otherwise)
- Test: `stream/route.test.ts`, `run/route.test.ts`, `packages/engine/src/projector/tail.test.ts` (add: pre-aborted signal ends without `finish`; `listEvents` throwing → `error` chunk then end; a second tail started after a partial first tail replays from seq 0 and `readUIMessageStream` yields the same final parts — **Review Focus 1**)

**Interfaces:**
- `GET /api/chats/[id]/stream` and `GET /api/chats/[id]/run` per Global Constraints; both reuse `getSessionUser`, `getOwnedChat`, `runStore`.
- `lastSeq` for `/run` = `max(seq)` via a new `RunStore.lastSeq(runId): Promise<number>` (memory + drizzle, trivial).

- [ ] **Step 1: Write failing route tests** — 401; 404 for another user's chat (**Review Focus 4**, assert JSON body and no `text/event-stream`); no active run → 204 (stream) / `{status:'none'}` (run); active run → 200 `text/event-stream` whose first line is `start` with the run's `assistantMessageId` (mock `@xo/engine` tail as in Phase 1) / `{ runId, status:'running', stage, assistantMessageId, lastSeq }`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `pnpm --filter web test`, engine tests → PASS. **Step 5: Commit** `feat(web): resume stream and run status endpoints`

---

### Task 4: Page loader and client reattach

**Files:**
- Modify: `apps/web/src/app/c/[id]/page.tsx`, `apps/web/src/modules/chat/chat.tsx`
- Create: `apps/web/src/modules/chat/use-run-status.ts`, `apps/web/src/server/chat-page.ts`
- Test: `apps/web/src/server/chat-page.test.ts`, `apps/web/src/modules/chat/use-run-status.test.ts` (jsdom)

**Interfaces:**
- `loadChatPage(chatId, userId): Promise<{ initialMessages: OpinionsUIMessage[]; activeRun: { id; assistantMessageId; stage } | null }>` in `server/chat-page.ts`: loads rows, finds the active run, drops the row whose id equals `activeRun.assistantMessageId`; for the latest terminal run, if its assistant row has `parts.length === 0`, calls `materialiseRun(runStore, run.id)` and substitutes the parts.
- `useRunStatus(chatId, { enabled, intervalMs = 5000, fetch? }): { status: 'none'|'queued'|'running'|'done'|'failed'|'cancelled'; stage?: Stage; runId?: string }` polling `GET /api/chats/:id/run`; stops when terminal or `!enabled`.
- `chat.tsx`: props `{ chatId, initialMessages, activeRun }`; `useChat({ id, messages, resume: !!activeRun, transport: new DefaultChatTransport({ api, prepareSendMessagesRequest, prepareReconnectToStreamRequest: ({ id }) => ({ api: \`/api/chats/${id}/stream\` }) }) })`; effect: when `runStatus.status` is `queued|running` and `status === 'ready'`, call `resumeStream()` (guard with a ref so it fires once per transition); composer disabled while the run is active per the poll, not only per stream status; when `runStatus` turns terminal, `router.refresh()` is NOT needed (the stream delivered the parts) — just re-enable the composer per Phase 1 rules.

- [ ] **Step 1: Write failing tests** — `chat-page.test.ts`: with an active run, the returned messages exclude the in-flight assistant row and `activeRun` is set (**Review Focus 1**); with a terminal run whose assistant parts are empty, `materialiseRun` is called and its parts used; no runs → messages unchanged. `use-run-status.test.ts`: polls at the interval while active, stops on `done`, exposes `status`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `pnpm --filter web test && typecheck && build` → PASS. **Step 5: Commit** `feat(web): omit in-flight turn on load and reattach the stream`

---

### Task 5: Cancel and retry routes + UI

**Files:**
- Create: `apps/web/src/app/api/chats/[id]/run/cancel/route.ts`, `apps/web/src/app/api/chats/[id]/run/retry/route.ts`, `apps/web/src/server/retry.ts`
- Modify: `apps/web/src/server/runs.ts` (export `cancelActiveRun(chatId)` wrapping `cancelRun`), `apps/web/src/modules/chat/chat.tsx` (Stop → cancel route when a run is active, then `stop()`), `apps/web/src/modules/chat/parts/pipeline-timeline.tsx` (`onRetry?: () => void` renders a "Retry from here" button on the failed row), `apps/web/src/modules/chat/message-parts.tsx` (threads `onRetry` for the latest failed turn only)
- Test: `cancel/route.test.ts`, `retry/route.test.ts`, `server/retry.db.test.ts` (real DB, skips without `DATABASE_URL`)

**Interfaces:**
- `retryRun({ chatId, userId }): Promise<{ run: Run; assistantMessageId: string }>` in `server/retry.ts` implementing the Retry semantics in one transaction (new message, new run via `tx`, event copy with `insert ... select` ordered by old seq, final `stage pending 'Retrying'` event). Throws `RunActiveError` / `RunNotFailedError`.
- Chat UI after a successful retry: `router.refresh()` then the loader's `activeRun` path + `resume` take over.

- [ ] **Step 1: Write failing tests** — cancel: 401/404; active run → 200 and `cancelRun` called; terminal → 409 `run_not_active`. retry route: 401/404; latest run `done` → 409 `run_not_failed`; active → 409 `run_active`; failed → 201 `{ runId, assistantMessageId }`. `retry.db.test.ts`: seed a failed run at `sim_prepare` with ids `{projectId, graphId, simulationId}` and 9 events incl. `stage(sim_prepare, failed)` + `error`; after `retryRun`: new run `queued` at `sim_prepare`, ids copied, cursors reset fields absent, new events = old minus the two terminal ones plus `stage(sim_prepare, pending)` with contiguous seq; old run untouched (**Review Focus 3**).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; build. **Step 5: Commit** `feat(web): cancel and retry a run`

---

### Task 6: Worker: fence handling, cancel cleanup, lease heartbeat and release

**Files:**
- Modify: `apps/worker/src/loop.ts`, `apps/worker/src/main.ts`
- Test: `apps/worker/src/loop.test.ts` (extend), `apps/worker/src/e2e.test.ts` (add one case)

**Interfaces:**
- `drive`: builds `deps.fence = { owner }`; wraps `tick` with a heartbeat `setInterval(() => store.renewLease(run.id, owner, leaseMs), leaseMs / 3)` cleared in `finally`; catches `FenceError` → re-reads the run; if `status === 'cancelled'` → `cleanupCancelled(run)` (best-effort `stop` + `closeEnv` when `ids.simulationId` and stage ∈ `sim_run|report`; log), return; otherwise log `lease lost` and return. On loop abort with a run in flight: `releaseLease(run.id, owner)`.

- [ ] **Step 1: Write failing tests** — memory store: cancel the run from "outside" between two ticks (call `cancelRun`), the next tick's write throws `FenceError`, loop calls `mirofish.simulation.stop` once and exits `drive` with the run still `cancelled` and its last event `cancelled` (**Review Focus 2**); heartbeat: with `leaseMs: 300` and a `tick` that takes 1 s (fake client with a delayed `getTask`), `renewLease` is called ≥ 3 times during the tick; abort mid-run → `releaseLease` called with the owner. e2e: start a run against the mock, cancel via `cancelRun` on the real store at `sim_run`, assert the mock saw `POST /api/simulation/stop` and the run is `cancelled`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `pnpm --filter worker test` (with `DATABASE_URL`) → PASS. **Step 5: Commit** `feat(worker): fenced writes, cancel cleanup, lease heartbeat and release`

---

### Task 7: Chat list, rename, delete, and the sidebar

**Files:**
- Create: `apps/web/src/app/api/chats/[id]/route.ts` (PATCH, DELETE), `apps/web/src/server/chat-list.ts`, `apps/web/src/modules/sidebar/{app-sidebar,chat-list,chat-item,rename-dialog}.tsx`, `apps/web/src/app/(chat)/layout.tsx`
- Modify: `apps/web/src/app/api/chats/route.ts` (add GET), `apps/web/src/app/page.tsx` → move under `(chat)/page.tsx` with the empty state (AI Elements `Suggestions` with three example questions that prefill the composer after creating a chat), `apps/web/src/app/c/[id]/page.tsx` → `(chat)/c/[id]/page.tsx`, `apps/web/src/server/chats.ts` (`listChats(userId)`, `renameChat`, `deleteChat` which cancels an active run first and deletes storage blobs best-effort), `apps/web/src/server/runs.ts` (`startRun` sets title + touches `updated_at`)
- Install: `pnpm dlx shadcn@4.22.1 add alert-dialog dropdown-menu input` (if missing)
- Test: `chats/route.test.ts` (GET), `chats/[id]/route.test.ts`, `server/chats.db.test.ts` (delete cascades, **Review Focus 5**), `modules/sidebar/chat-list.test.tsx`

**Interfaces:**
- `listChats(userId): Promise<Array<{ id; title; updatedAt; runStatus: Run['status'] | 'none' }>>` (one query with a lateral/subquery for the latest run status).
- `<AppSidebar chats activeId>` using shadcn `Sidebar*`; items show title (or "New conversation"), a status dot for `queued|running`, a dropdown with Rename / Delete (AlertDialog confirm). Rename and delete call the routes then `router.refresh()`; deleting the active chat navigates to `/`.

- [ ] **Step 1: Write failing tests** — GET list ordered by `updatedAt desc`, owned only; PATCH 400 on empty/121-char title, 200 renames; DELETE 204 and `deleteChat` called; `chats.db.test.ts`: delete a chat with messages/run/events/upload rows → all gone, `cancelRun` invoked for an active run, `storage.delete` called per upload key; sidebar renders titles and a status dot for a running chat.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `pnpm --filter web test && typecheck && build` → PASS. **Step 5: Commit** `feat(web): conversation sidebar with rename and delete`

---

### Task 8: End-to-end verification and docs

**Files:**
- Modify: `README.md` (reload/resume behaviour, cancel, retry, sidebar; remove the 280 s caveat and replace with "the page reattaches"), `docs/superpowers/plans/2026-10-20-phase-1-followups.md` (tick resolved notes)

- [ ] **Step 1: CLI**: full run as Phase 1 Task 14(b) but kill the SSE client at `sim_run` (`curl --max-time 20`), then `GET /api/chats/<id>/stream` → stream starts with `start` and the same assistant id and replays all prior parts, ending with `finish` when the run completes; `GET /run` reports `done`.
- [ ] **Step 2: CLI cancel**: new run; at `sim_prepare` `POST /run/cancel` → 200; SSE from a concurrent `GET /stream` ends with `abort` then `finish`; DB status `cancelled`; the worker log shows `FenceError`→cleanup or a clean exit; mock log shows `POST /api/simulation/stop` only if the run had reached `sim_run`.
- [ ] **Step 3: CLI retry**: `MOCK_FAIL_STAGE=sim_prepare` run → `failed`; restart the mock without the flag; `POST /run/retry` → 201; the new run completes; mock log shows ONE `ontology/generate` and ONE `build` across both runs (**Review Focus 3**).
- [ ] **Step 4: Browser (controller)**: start a run, reload at `sim_run` → the same turn continues (no duplicate), cards intact; close the tab for 60 s, reopen → caught up; cancel from the Stop button → "Cancelled" row; retry a failed run from the timeline button; rename and delete chats from the sidebar. Screenshot `.context/phase2-resume.jpg`.
- [ ] **Step 5: Gates**: `pnpm typecheck`, `DATABASE_URL=... pnpm test`, `pnpm --filter web build` exit 0; push; CI green.
- [ ] **Step 6: Commit** `docs: phase 2 resume/cancel/retry behaviour`

---

## Self-review notes

- Spec Phase 2 coverage: `GET /stream` ✔ T3; page loader omits in-flight assistant message ✔ T4; `use-run` poll + `resumeStream()` ✔ T4; worker materialise on transitions (already Phase 1) + release lease ✔ T6; cancel/retry routes ✔ T5; sidebar history ✔ T7. Follow-up design notes: retry as new run ✔ T5; fenced writes ✔ T2; cancel terminal event ✔ T1; loader re-projection for un-materialised terminal runs ✔ T4; `pollMs` floor + resume tests ✔ T3; lease release + heartbeat ✔ T6; 280 s caveat removed ✔ T8. Deferred to Phase 3/4: lenient poll-error retries, `ontology.poll` re-emit, transient-DB retry (noted in followups).
- Deviations from spec: cancel is projected as the AI SDK `abort` chunk (the spec had no cancel chunk); retry copies events into a fresh run rather than re-queueing the same row (the final reviewer showed same-row retry cannot stream).
- Names used consistently: `cancelRun`, `FenceError`, `fence`, `releaseLease`, `lastSeq`, `loadChatPage`, `useRunStatus`, `retryRun`, `RunNotFailedError`, `cancelActiveRun`, `listChats`, `renameChat`, `deleteChat`, `AppSidebar`.
- Unverified to confirm in T3/T4: that `useChat` with `resume: true` plus our `start{messageId}` replay rebuilds the omitted assistant message (the loader omission makes the design independent of it); that the `abort` chunk leaves `useChat` in `ready` status (if it reports an error instead, map `cancelled` to `finish` only and keep the stage part as the visible signal — decide in T1 with a jsdom test of `readUIMessageStream` + the client state).
