# Run Readiness Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Before a run starts, check whether the prompt and documents name people and groups MiroFish can simulate; if not, open the "Needs you" card pre-filled with drafted answers, and turn the no-people failure into a free "Add who's involved" rerun.

**Architecture:** A new `POST /api/chats/:id/readiness` endpoint extracts document text, calls the OpenAI-compatible model MiroFish already uses (AI SDK 7 `generateText` + `Output.object`), and fails open. The client calls it on send and shows the existing `ContextCard` with initial values when `ready` is false. The engine tags MiroFish's no-entities failure with a stable `no_actors` code, and the retry path gains a restart-from-ontology mode that swaps in a new `seed.md`.

**Tech Stack:** Next.js App Router (web), AI SDK 7.0.143 (`ai`), `@ai-sdk/openai-compatible`, `unpdf`, Drizzle, Vitest, pnpm/turbo.

**Spec:** `docs/superpowers/specs/2026-10-29-run-readiness-design.md`

## Global Constraints

- Web env vars `LLM_API_KEY`, `LLM_BASE_URL` (default `https://api.openai.com/v1`), `LLM_MODEL_NAME` (default `gpt-4o-mini`), all optional; `LLM_API_KEY` unset → check off (always `ready: true`, no model call).
- Check timeout 8 s. Timeout, model error, invalid output, extraction failure, over rate limit → `{ ready: true }`. The check never stops a run.
- Up to 12 000 characters of extracted text per document.
- Rate limit: 20 checks per user per rolling hour, per server instance (in-memory). Over the limit → `{ ready: true }` without calling the model.
- Fast path: no uploads and `wordCount(text) >= SEED_PROMPT_MIN_WORDS` (40) → skip the check client-side.
- The check endpoint writes nothing and spends no quota; it applies `demo_paused` (409) and `quota_exceeded` (429, `resetAt`) exactly as `POST /messages` does.
- With uploads, `seed.md` is attached only when the request carries non-empty `seed` answers; it is added server-side after `MAX_FILES` validation. Without uploads, behaviour is unchanged.
- The no-people rerun is a retry (`retryOf` set): no quota, no new user message, restarts at stage `ontology` with the original non-seed uploads plus a new `seed.md`.
- Draft fields are each ≤ `SEED_FIELD_MAX` (2000) characters.
- Card copy when pre-filled: title "We drafted who to simulate", description "Check these and run. Edit anything that's wrong.", primary button "Run with these", no skip button. Unfilled card keeps today's copy and skip button. Pending status text: "Reading your brief…". Failure button: "Add who's involved".

## Review Focus

- **Scanned/image-only PDF** — extraction yields no text; the check must still answer (judging on the prompt alone), not throw. Test in Task 2.
- **Model returns `ready: false` without a usable draft** (missing or blank `actors`) — treat as `ready: true` rather than showing an empty pre-filled card. Test in Task 2.
- **Guest out of quota sends a prompt** — gets the quota notice immediately, no model call, no card. Test in Task 3.
- **Abandoning the pre-filled card** (navigate away / new chat) — no run, no message, no seed upload exists. Test in Task 5.
- **Double click on Send or "Run with these" while the check or start is in flight** — exactly one readiness call and one run. Test in Task 5.

---

### Task 1: Engine — `no_actors` code and restart preparation

**Files:**
- Modify: `packages/mirofish/src/messages.ts` (export the English no-entities string)
- Modify: `packages/mirofish/src/index.ts` (re-export)
- Modify: `packages/engine/src/orchestrator/fail.ts`
- Modify: `packages/engine/src/orchestrator/retry.ts`
- Create: `packages/engine/src/orchestrator/fail.test.ts`
- Modify: `packages/engine/src/orchestrator/retry.test.ts`

**Interfaces:**
- Produces: `NO_ACTORS_MESSAGE: string` from `@xo/mirofish` (the exact English string already in `EXACT`); `NO_ACTORS_CODE = 'no_actors'` from `@xo/engine`; `prepareRestart(run: Run): { ids: RunIds; cursors: RunCursors; stage: 'ontology' }` from `@xo/engine`.

- [ ] **Step 1: Write failing tests**
  - `fail()` with a `MiroFishError({ code: 'api', message: '没有找到符合条件的实体，请检查图谱是否正确构建' })` stores `error.code === 'no_actors'` and emits an `error` event with `code: 'no_actors'`; any other MiroFish message keeps its original code.
  - `prepareRestart(run)` on a run with every `ids` key and `cursors.feed`, `simStarted` set returns `{ ids: {}, cursors: { retries: 0, startAttempts: 0, idlePolls: 0 }, stage: 'ontology' }`.
- [ ] **Step 2: Run** `pnpm --filter @xo/engine test -- fail retry` — expect FAIL.
- [ ] **Step 3: Implement.** In `fail`, after computing `message`, set `code = message === NO_ACTORS_MESSAGE ? NO_ACTORS_CODE : code`. Add `prepareRestart` beside `prepareRetry`; export both constants and the function from the engine index.
- [ ] **Step 4: Run** the same tests — expect PASS; `pnpm typecheck`.
- [ ] **Step 5: Commit** `feat(engine): tag MiroFish's no-entities failure as no_actors; restart preparation`

### Task 2: Web server — document text, readiness check, rate limit

**Files:**
- Modify: `apps/web/package.json` (add `unpdf`, `@ai-sdk/openai-compatible`)
- Modify: `apps/web/src/env.schema.ts`, `apps/web/src/env.test.ts`, `.env.example`, `docs/hosting.md` (three LLM vars; note they match MiroFish's)
- Create: `apps/web/src/server/readiness/document-text.ts`
- Create: `apps/web/src/server/readiness/prompt.ts` (system prompt + schema only)
- Create: `apps/web/src/server/readiness/check.ts`
- Create: `apps/web/src/server/readiness/rate-limit.ts`
- Test: `document-text.test.ts`, `check.test.ts`, `rate-limit.test.ts` beside them

**Interfaces:**
- Produces:
  - `type ReadinessDraft = { background: string; actors: string; change: string }`
  - `type Readiness = { ready: true } | { ready: false; draft: ReadinessDraft }`
  - `documentText(file: { bytes: Uint8Array; mediaType: string; filename: string }): Promise<string>` — PDF via `unpdf` `extractText` (merged pages), markdown/plain via `TextDecoder`; trimmed and cut to 12 000 chars; returns `''` on any extraction error.
  - `checkReadiness(input: { text: string; documents: Array<{ filename: string; text: string }>; force?: boolean }, deps?: { generate?: typeof generateText; now?: () => number }): Promise<Readiness>` — `force: true` (retry path) always returns a draft unless the model fails, in which case it returns `{ ready: false, draft: { background: '', actors: '', change: '' } }`.
  - `allowCheck(userId: string, now?: number): boolean` — 20 per rolling hour per user, module-level `Map`.

- [ ] **Step 1: Write failing tests**
  - `documentText`: a small fixture PDF (generate in the test with a minimal valid PDF string containing "Angel investors") returns text containing `Angel investors`; a `.md` returns its content; bytes `[0x00]` labelled `application/pdf` return `''`; a 20 000-char text returns exactly 12 000 chars.
  - `checkReadiness` with a stubbed `generate`: model output `{ ready: true }` → `{ ready: true }`; `{ ready: false, draft: { actors: 'Seed VCs', background: 'b', change: 'c' } }` → passed through; `{ ready: false, draft: { actors: '  ' ... } }` → `{ ready: true }`; generate rejects → `{ ready: true }`; generate never resolves → `{ ready: true }` after 8 s (fake timers); `LLM_API_KEY` unset (mock `@/env`) → `{ ready: true }` and `generate` not called; each draft field longer than 2000 chars is cut to 2000; `force: true` with rejecting generate → the empty-draft form above.
  - Prompt test: the user message passed to `generate` contains the question and each document's filename and text.
  - `allowCheck`: 20 calls true, 21st false, true again after 1 h.
- [ ] **Step 2: Run** `pnpm --filter web test -- readiness` — expect FAIL.
- [ ] **Step 3: Implement.** `check.ts` builds the model with `createOpenAICompatible({ name: 'llm', baseURL: env.LLM_BASE_URL, apiKey: env.LLM_API_KEY })(env.LLM_MODEL_NAME)` and calls `generateText({ model, system, prompt, output: Output.object({ schema }), abortSignal: AbortSignal.timeout(8000) })`. The schema is `z.object({ ready: z.boolean(), draft: z.object({ background, actors, change }).nullable() })`. `prompt.ts` system prompt states: MiroFish builds a knowledge graph from the documents and simulates the people and organisations it finds; answer `ready: true` only if the question and documents name specific groups whose opinions matter to the question; otherwise draft the three fields grounded in the documents (actors as a `- ` bullet list of 4–7 concrete groups, background ≤ 4 sentences, change = the decision or event being tested), never generic placeholders, in the language of the question.
- [ ] **Step 4: Run** the tests — PASS; `pnpm typecheck && pnpm lint`.
- [ ] **Step 5: Commit** `feat(web): readiness check reads the brief and drafts who to simulate`

### Task 3: Readiness endpoint

**Files:**
- Create: `apps/web/src/app/api/chats/[id]/readiness/route.ts`
- Create: `apps/web/src/server/run-gate.ts` (shared paused/quota gate)
- Modify: `apps/web/src/app/api/chats/[id]/messages/route.ts` (use `run-gate`)
- Modify: `apps/web/src/server/uploads.ts` (add `readOwnedUploads`)
- Test: `apps/web/src/app/api/chats/[id]/readiness/route.test.ts`, `apps/web/src/server/run-gate.test.ts`

**Interfaces:**
- Consumes: `checkReadiness`, `documentText`, `allowCheck` (Task 2).
- Produces:
  - `checkRunGate(user): Promise<{ ok: true; limits: Limits; window: {...} } | { ok: false; response: Response }>` — the existing paused/quota block from the messages route, moved verbatim (rounds check stays in the messages route).
  - `readOwnedUploads(input: { chatId: string; userId: string; uploadIds: string[] }): Promise<Array<{ id: string; filename: string; mediaType: string; storageKey: string }>>`
  - `POST /api/chats/:id/readiness` body `{ text: string; uploadIds: string[] } | { retry: true }` → `200 Readiness`. Errors: 401, 404 (not owned and not a valid new chat id), 400 invalid body / uploads not owned, 409 `demo_paused`, 429 `quota_exceeded` with `resetAt`, 409 `run_not_failed` (retry form when latest run isn't failed with `no_actors`).

- [ ] **Step 1: Write failing tests** (mock session, chats, runs, uploads, storage, `checkReadiness` as in `uploads/sign/route.test.ts`):
  - 401 without session; 404 for an unowned non-chat-id.
  - Paused → 409 `demo_paused` and `checkReadiness` not called; out of quota → 429 with `resetAt` and `checkReadiness` not called.
  - Upload ids not all owned → 400.
  - Happy path: passes `text` and each document's extracted text to `checkReadiness`; returns its result.
  - `allowCheck` false → `{ ready: true }` and `checkReadiness` not called.
  - Retry form: latest run failed with `error.code === 'no_actors'` → calls `checkReadiness` with `config.requirement`, the run's uploads excluding `seed.md`, and `force: true`; skips the quota gate (paused still 409); other latest-run states → 409 `run_not_failed`.
- [ ] **Step 2: Run** `pnpm --filter web test -- readiness run-gate` — FAIL.
- [ ] **Step 3: Implement** the route and gate; switch the messages route to `checkRunGate` with no behaviour change (its existing tests must still pass). Seed uploads are identified by `filename === 'seed.md' && mediaType === 'text/markdown'`.
- [ ] **Step 4: Run** `pnpm --filter web test` — PASS.
- [ ] **Step 5: Commit** `feat(web): readiness endpoint, gated by pause and quota`

### Task 4: Seed with uploads, and the no-actors restart

**Files:**
- Modify: `apps/web/src/app/api/chats/[id]/messages/route.ts`
- Modify: `apps/web/src/app/api/chats/[id]/run/retry/route.ts`
- Modify: `apps/web/src/server/retry.ts`
- Test: messages `route.test.ts`, retry `route.test.ts`, `apps/web/src/server/retry.db.test.ts`

**Interfaces:**
- Consumes: `prepareRestart`, `NO_ACTORS_CODE` (Task 1); `createSeedUpload`, `buildSeedDocument` (existing).
- Produces: `retryRun(input: { chatId: string; userId: string; restart?: { uploadIds: string[] } })`; retry route body optional `{ seed: { background?, actors?, change? } }` (same zod as message body's `seed`).

- [ ] **Step 1: Write failing tests**
  - Messages route: uploads + non-empty `seed` → `createSeedUpload` called once and `startRun` receives the user's ids followed by the seed id (6 ids allowed when the user sent 5); uploads without `seed` (or with all-empty fields) → `createSeedUpload` not called, ids unchanged; no uploads → unchanged behaviour.
  - Retry route: body with `seed` while the latest failed run has `error.code === 'no_actors'` → writes a seed from `config.requirement` + answers and calls `retryRun` with `restart.uploadIds` = original non-seed ids + new seed id; body with `seed` for any other failure → 409 `run_not_failed`; no body → today's behaviour.
  - `retryRun` with `restart` (db test): new run has `retryOf` = old id, `stage: 'ontology'`, `ids: {}`, `config.uploadIds` = restart ids, other config unchanged; its only event is `stage ontology pending "Retrying"`; `runsStartedSince` does not count it.
- [ ] **Step 2: Run** `pnpm --filter web test -- messages retry` — FAIL. The `*.db.test.ts` cases skip without a database; run them against the local Postgres from `pnpm dev` (same `DATABASE_URL`) and confirm they execute, not skip.
- [ ] **Step 3: Implement.** In `retryRun`, when `restart` is given, use `prepareRestart(old)`, override `config.uploadIds`, and copy no old events.
- [ ] **Step 4: Run** the tests — PASS.
- [ ] **Step 5: Commit** `feat(web): seed travels with documents when answered; no-actors rerun restarts free`

### Task 5: Client — check on send, pre-filled card

**Files:**
- Modify: `apps/web/src/modules/chat/parts/context-card.tsx`
- Modify: `apps/web/src/modules/chat/chat.tsx`
- Create: `apps/web/src/modules/chat/readiness.ts` (client fetch helper)
- Test: `context-card.test.tsx`, `chat.test.tsx`, `readiness.test.ts`

**Interfaces:**
- Consumes: readiness endpoint (Task 3); messages route `seed` with uploads (Task 4).
- Produces:
  - `ContextCard` props gain `initial?: SeedContext`; when present the card uses the pre-filled copy from Global Constraints and hides the skip button.
  - `requestReadiness(chatId: string, body: { text: string; uploadIds: string[] } | { retry: true }, fetchImpl?): Promise<{ ok: true; readiness: Readiness } | { ok: false; code: string }>` — network failure or 5xx → `{ ok: true, readiness: { ready: true } }`.
  - `pendingRun` state becomes `{ text; runOptions; uploadIds: string[]; draft?: SeedContext; checking: boolean }`.

- [ ] **Step 1: Write failing tests**
  - Card: with `initial`, fields show the drafted values, title "We drafted who to simulate", button "Run with these", no "Skip and run with my question"; clearing a field and clicking runs with that field omitted.
  - Chat: a send with an upload calls readiness once and, on `{ ready: true }`, posts `/messages` with the upload ids and no `seed`; on `{ ready: false, draft }` shows the pre-filled card above the user's text, and "Run with these" posts `/messages` with the upload ids and the `seed`; while the check is pending the thread shows "Reading your brief…" and the composer is disabled; double-clicking Send produces one readiness call.
  - A 40+ word prompt without uploads skips readiness; a short prompt without uploads calls it.
  - Readiness 429 → the quota notice from `send-notices` and no card; readiness network error → run starts.
  - Abandon: with the pre-filled card open, starting a new chat leaves no `/messages` call.
- [ ] **Step 2: Run** `pnpm --filter web test -- context-card chat readiness` — FAIL.
- [ ] **Step 3: Implement.** Replace the `needsSeedContext` branch in `onSend`: fast path → `startRun`; otherwise set `pendingRun` with `checking: true`, call `requestReadiness`, then either `startRun` or keep `pendingRun` with `draft`. `startPending` passes `pendingRun.uploadIds`. Without a draft and with a short prompt and no uploads (check off/failed), keep today's empty card.
- [ ] **Step 4: Run** `pnpm --filter web test` — PASS.
- [ ] **Step 5: Commit** `feat(web): check the brief before a run and pre-fill the context card`

### Task 6: Client — "Add who's involved" on no-actors failure

**Files:**
- Modify: `apps/web/src/modules/chat/console/run-console.tsx` (new optional `onAddActors`)
- Modify: `apps/web/src/modules/chat/message-parts.tsx` (thread the prop)
- Modify: `apps/web/src/modules/chat/chat.tsx`
- Test: `run-console.test.tsx`, `chat.test.tsx`

**Interfaces:**
- Consumes: `requestReadiness(chatId, { retry: true })` (Task 5); retry route `{ seed }` (Task 4).
- Produces: `RunConsole` prop `onAddActors?: () => void`; when given, the failed band shows "Add who's involved" instead of "Retry from here".

- [ ] **Step 1: Write failing tests**
  - Console: with `onAddActors`, the failed row shows "Add who's involved" and no "Retry from here".
  - Chat: when the last message's `data-error` part has `code: 'no_actors'`, clicking "Add who's involved" calls readiness with `{ retry: true }`, shows the pre-filled card under the failed run, and "Run with these" POSTs `/run/retry` with `{ seed }` and refreshes; other failures keep "Retry from here".
- [ ] **Step 2: Run** `pnpm --filter web test -- run-console chat` — FAIL.
- [ ] **Step 3: Implement**, reusing `ContextCard` with `initial`; a forced draft with all-empty fields renders as the unfilled card copy but still posts to `/run/retry`.
- [ ] **Step 4: Run** `pnpm lint && pnpm typecheck && pnpm test` — all PASS.
- [ ] **Step 5: Commit** `feat(web): no-people failure offers "Add who's involved"`

### Release notes for the operator (no task)

Set `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL_NAME` on the Vercel project to the same values as the MiroFish app on Fly before merging; without them the check stays off. Verify on production with a pitch-deck PDF and "Is this a good investment opportunity".
