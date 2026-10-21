# Xenet Opinions Phase 1: Full Pipeline Happy Path — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A user attaches documents, asks a question, and watches a MiroFish run unfold inside one chat turn: six stage cards update in place, an ontology card, a graph preview, an agent roster and a simulation feed fill in, a report workbench shows the agent's tool calls, and the final report arrives as the assistant's text. A background worker drives MiroFish; Postgres `run_events` is the source of truth; the chat stream is a projection of it.

**Architecture:** `POST /api/chats/:id/messages` persists the user message, creates a queued `runs` row plus an empty assistant message, and returns a UI message stream that tails `run_events`. `apps/worker` claims runs with `FOR UPDATE SKIP LOCKED`, ticks an idempotent per-stage state machine against the `@xo/mirofish` client (polling every 2 s, mirroring MiroFish's own UI), appends events, and materialises the assistant message's parts. A fixture-replaying mock MiroFish server makes the whole thing runnable without Zep or an LLM.

**Tech Stack:** Existing Phase 0 stack (pnpm 10.30, Node 24, Next 16.4, React 19.3, `ai` 7.0.143, `@ai-sdk/react` 4.0.147, Drizzle 0.45.4, Better Auth 1.7.11, Zod 4.6.7, Vitest 5) plus `@next/env@16.4.2`, `react-force-graph-2d@1.29.2`, `@aws-sdk/client-s3@3.1153.0`, `tsx@4.23.15`, AI Elements `reasoning`, `artifact`, `chain-of-thought`, `tool`, `sources`, `suggestion` (shadcn registry).

**Spec:** `docs/superpowers/specs/2026-10-19-xenet-opinions-design.md` (Architecture, Data model, Orchestrator, UI, Phases 1 sections). Follow-ups folded in from `docs/superpowers/plans/2026-10-20-phase-0-followups.md`: env unification, idempotent user insert, Zod body validation, `persistAssistantParts` → engine projector, part-level validation.

## Global Constraints

- Everything stays MIT and clean-room: never import, vendor, or paraphrase MiroFish or TurboStarter code. The mock server replays our own fixtures.
- Package names: `@xo/engine`, `@xo/storage`, `worker` (app). Engine must not import React or Next; it may import `@xo/db`, `@xo/mirofish`, `ai`, `zod`.
- Stage names and order exactly `ontology | graph_build | sim_create | sim_prepare | sim_run | report | finished`; stage part id `stage:<name>`.
- Run statuses exactly `queued | running | done | failed | cancelled`.
- `run_events.kind` values exactly: `stage, ontology, graph, agents, sim_feed, report_outline, report_event, sources, report_text, error, done`. `part_id` values: `stage:<name>`, `ontology`, `graph`, `agents`, `sim_feed`, `report_outline`, `report_event:<n>`, `sources`, `report`, and `null` for `error`/`done`.
- UI data part types exactly: `data-stage`, `data-ontology`, `data-graph`, `data-agents`, `data-sim_feed`, `data-report_outline`, `data-report_event`, `data-sources`, `data-error`. Report text is `text-start/text-delta/text-end` with id `report`, emitted exactly once. Every chunk for the same part reuses its `id` (in-place reconciliation).
- MiroFish calls go through `createMiroFishClient` from `@xo/mirofish` only. Every stage's `enter()` persists the id it obtained (`runs.ids`) **before** appending any event. `enter()` is never called when that stage's id is already present.
- Worker polls MiroFish every `WORKER_POLL_MS` (default 2000). Lease 60 s, renewed every tick. Concurrency gate `MAX_CONCURRENT_RUNS` (default 1).
- Env var names: existing six plus `STORAGE_DRIVER` (`local|s3`, default `local`), `STORAGE_LOCAL_DIR` (default `.data/uploads`, git-ignored), `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `WORKER_POLL_MS`, `MAX_CONCURRENT_RUNS`, `WORKER_ID` (default hostname+pid).
- Upload limits: media types `application/pdf`, `text/markdown`, `text/plain` (also accept `.md`/`.txt` with empty or `application/octet-stream` type by extension); max 5 files per message; max 10 MB per file.
- Run options from the composer: `maxRounds` integer 1..40 (default 3 for the mock/dev; 40 is MiroFish's own default), `uploadIds: string[]`.
- Error bodies: existing 401/404/400 plus 409 `{ "error": "run_active" }` when the chat already has a run with status `queued|running`, and 409 `{ "error": "run_finished" }` when the chat's run is `done` (follow-up chat arrives in Phase 3), 400 `{ "error": "invalid_body" }` on Zod failure, 400 `{ "error": "upload_rejected", "reason": string }` for uploads.
- DB columns snake_case; always access through Drizzle keys.
- Comments: none unless they prevent a bug or document an invariant the code cannot express; single-line only.
- All existing Phase 0 tests keep passing.

## Review Focus

1. A second message posted while a run is `queued|running` must return 409 `run_active` and create no second run or assistant row. (test in Task 11)
2. If the worker dies after MiroFish accepted `start` but before the tick finished, a restarted worker must NOT call `start` again: the id must be persisted before anything else. (test in Task 6: `store.update` with the id is awaited before any `appendEvent`; and resume-from-`sim_run` with `ids.simulation_id` set never calls `start`)
3. An upload with a disallowed type, >10 MB, or a 6th file must be rejected with 400 before any byte is written to storage. (test in Task 10)
4. When MiroFish reports a task `failed`, the run ends `failed` with `error.stage` set, the stream emits a failed `data-stage` then an `error` chunk then `finish`, and the assistant message's persisted parts show the failed stage. (tests in Tasks 6 and 7)
5. Two workers claiming at once must hand the run to exactly one of them. (test in Task 5)

---

### Task 1: Env unification and body-validation groundwork

**Files:**
- Modify: `apps/web/next.config.ts`, `apps/web/src/env.schema.ts`, `apps/web/src/env.test.ts`, `.env.example`, `.gitignore`, `README.md`, `.github/workflows/ci.yml`
- Create: `packages/config/env.ts`

**Interfaces:**
- Produces: `loadRootEnv(importMetaUrl: string): void` in `@xo/config/env` — resolves the repo-root `.env` relative to the caller, calls `process.loadEnvFile` inside try/catch, never overrides existing vars. `drizzle.config.ts` switches to it. `envSchema` gains the Phase 1 vars (Global Constraints) with defaults; `parseEnv` unchanged.

- [ ] **Step 1: Write failing env tests** — `parseEnv({...valid, STORAGE_DRIVER: 'ftp'})` throws; `parseEnv(valid).STORAGE_DRIVER === 'local'`; `parseEnv(valid).WORKER_POLL_MS === 2000`; `parseEnv({...valid, STORAGE_DRIVER: 's3'})` throws when `S3_BUCKET` missing (use `superRefine`).
- [ ] **Step 2: Run** `pnpm --filter web test` → FAIL.
- [ ] **Step 3: Implement.** `next.config.ts`: `import { loadEnvConfig } from '@next/env'; loadEnvConfig(path.resolve(process.cwd(), '../..'))` at the top (Next resolves `apps/web` as cwd under turbo; guard with `existsSync`). Remove the symlink instruction from README (replace with "env is read from the repo-root `.env`"), delete the local `apps/web/.env` symlink, drop the CI "write web env file" step, add `.data/` to `.gitignore`, add the new vars to `.env.example`.
- [ ] **Step 4: Verify** `pnpm --filter web test && pnpm typecheck && pnpm --filter web build` with no `apps/web/.env` present, and `pnpm --filter web dev` boots and `/api/auth/sign-in/anonymous` still works (curl).
- [ ] **Step 5: Commit** `chore: load root .env via @next/env; phase 1 env vars`

---

### Task 2: Mock MiroFish server

**Files:**
- Create: `packages/mirofish/mock/server.ts`, `packages/mirofish/mock/state.ts`, `packages/mirofish/mock/fixtures.ts`, `packages/mirofish/mock/report.md`
- Modify: `packages/mirofish/package.json` (script `mock: tsx mock/server.ts`), `packages/mirofish/tsconfig.json` (include `mock`), `packages/mirofish/README.md`
- Test: `packages/mirofish/mock/server.test.ts`

**Interfaces:**
- Produces: `startMockMiroFish(opts: { port?: number; speed?: number }): Promise<{ url: string; close(): Promise<void> }>`; CLI `pnpm --filter @xo/mirofish mock` reads `PORT` (default 5001) and `MOCK_SPEED` (default 1; `10` makes every delay 10× shorter).
- Behaviour (Node `http`, no framework; responses are `{success, data}` envelopes built from the Phase 0 fixtures plus timers):
  - `POST /api/graph/ontology/generate` (multipart; requires ≥1 `files` part and `simulation_requirement`, else `{success:false,error}` 400): waits `3000/speed` ms, returns the ontology fixture with a fresh `proj_` id.
  - `POST /api/graph/build`: returns `{project_id, task_id}`; the task progresses 0→100 over `4000/speed` ms (`GET /api/graph/task/:id` → `processing` with `progress`, then `completed` with `result.graph_id`). `GET /api/graph/data/:graphId` → 80 nodes/124 edges sample.
  - `POST /api/simulation/create` → `{simulation_id, project_id, graph_id, status:'created'}`.
  - `POST /api/simulation/prepare` → task; `POST /api/simulation/prepare/status` progresses with `progress_detail.current_item/total_items` over `4000/speed` ms; `GET /:sim/profiles/realtime` returns a growing list up to 12 profiles (`{agent_id, name, handle, role, bio, topics[]}`), `is_generating` true until done.
  - `POST /api/simulation/start` → `{simulation_id, runner_status:'starting'}`; `GET /:sim/run-status` advances `current_round` to `max_rounds` over `max_rounds * 1000/speed` ms with counters; `GET /:sim/posts?platform=` returns accumulated posts (`{post_id, agent_name, content, round}`), 2 per round per platform.
  - `POST /api/report/generate` → `{simulation_id, report_id, task_id, status:'generating'}`; `GET /api/report/:id/agent-log?from_line=` serves the agent-log fixture lines one every `500/speed` ms; after the last line `GET /api/report/:id` → `completed` with `markdown_content` = `mock/report.md`.
  - `POST /api/simulation/stop`, `/close-env` → `{success:true}`. Unknown route → 404 envelope.
  - Header `X-MiroFish-Token`: if `MOCK_TOKEN` env is set, reject requests without the matching header with 401 envelope.

- [ ] **Step 1: Write failing `server.test.ts`** — starts the mock on port 0 with `speed: 100`; drives the full pipeline through `createMiroFishClient({ baseUrl })`: ontology → build → poll until `completed` → create → prepare → poll until done → start → poll until `completed` → generate → agent-log until `report_complete` → report `completed` with non-empty markdown. One `it` per stage plus `it('rejects missing files on ontology')` and `it('requires token when MOCK_TOKEN set')`.
- [ ] **Step 2: Run** → FAIL (module missing).
- [ ] **Step 3: Implement** the three mock files; multipart parsing via `new Request(...)`-free approach: use `busboy`? No — use Node 24's `undici` `FormData` parsing: `await new Response(req, { headers }).formData()` (Node 24 supports `Response.formData()`), which avoids a dependency.
- [ ] **Step 4: Run** `pnpm --filter @xo/mirofish test && pnpm --filter @xo/mirofish typecheck` → PASS (existing 57 + new).
- [ ] **Step 5: Commit** `feat(mirofish): fixture-replaying mock MiroFish server`

---

### Task 3: Run tables and migration

**Files:**
- Create: `packages/db/src/schema/runs.ts`
- Modify: `packages/db/src/schema/index.ts`, `packages/db/src/index.ts`
- Test: `packages/db/src/schema/runs.test.ts`

**Interfaces:**
- Produces tables (snake_case columns, Drizzle keys camelCase):
  - `runs(id text pk, chatId fk chats cascade, userId fk user cascade, assistantMessageId text notNull, status text notNull default 'queued', stage text notNull default 'ontology', config jsonb notNull $type<RunConfig>, ids jsonb notNull default '{}' $type<RunIds>, cursors jsonb notNull default '{}' $type<RunCursors>, error jsonb $type<RunError|null>, attempt int notNull default 0, leaseOwner text, leaseUntil timestamptz, envState text notNull default 'none', envKeepaliveUntil timestamptz, queuedAt timestamptz notNull default now(), startedAt timestamptz, finishedAt timestamptz)`; index `(status, queued_at)`; unique partial index `runs_one_active_per_chat` on `(chat_id) WHERE status IN ('queued','running')`.
  - `runEvents(id bigserial pk, runId fk runs cascade, seq int notNull, kind text notNull, partId text, payload jsonb notNull, createdAt)`; unique `(run_id, seq)`.
  - `uploads(id text pk, userId fk, chatId fk cascade, storageKey text notNull, filename text notNull, mediaType text notNull, sizeBytes int notNull, createdAt)`.
  - Types in the same file: `RunConfig = { requirement: string; maxRounds: number; uploadIds: string[] }`, `RunIds = Partial<{ projectId; graphId; graphTaskId; simulationId; prepareTaskId; reportId; reportTaskId }>` (all string), `RunCursors = Partial<{ agentLogLine: number; lastRound: number; postsOffsetTwitter: number; postsOffsetReddit: number }>`, `RunError = { stage: Stage; code: string; message: string }`. `Stage` is re-declared here as the string union (db cannot import engine); engine's `STAGES` must match (engine test asserts equality).
  - Exports `Run`, `NewRun`, `RunEvent`, `Upload` row types.

- [ ] **Step 1: Write failing `runs.test.ts`** (skips without `DATABASE_URL`): inserting two `queued` runs for the same chat throws (unique partial index); inserting `run_events` with duplicate `(run_id, seq)` throws; deleting a chat cascades runs, events and uploads.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** schema; `pnpm --filter @xo/db db:generate` → migration `0001_*.sql`; `db:migrate`. **Step 4: Run** → PASS. **Step 5: Commit** `feat(db): runs, run_events, uploads tables`

---

### Task 4: Engine part types and event→chunk mapping

**Files:**
- Modify: `packages/engine/src/parts.ts`, `packages/engine/src/index.ts`, `packages/engine/package.json` (deps `@xo/db`, `@xo/mirofish`, `zod`)
- Create: `packages/engine/src/events.ts`, `packages/engine/src/projector/to-chunks.ts`
- Test: `packages/engine/src/parts.test.ts` (extend), `packages/engine/src/projector/to-chunks.test.ts`

**Interfaces:**
- `parts.ts` adds, with Zod schemas alongside each type (schemas are used for part-level validation in web and for event payload validation):
  - `OntologyData = { entityTypes: string[]; relationTypes: string[]; summary?: string }`
  - `GraphData = { graphId: string; nodeCount: number; edgeCount: number; nodes: Array<{ id: string; label: string; type?: string }>; links: Array<{ source: string; target: string; label?: string }> }` (sampled ≤200 nodes)
  - `AgentsData = { count: number; expected?: number; profiles: Array<{ id: string; name: string; handle?: string; role?: string; bio?: string; topics: string[] }> }`
  - `SimFeedData = { round: number; totalRounds: number; twitterActs: number; redditActs: number; posts: Array<{ id: string; platform: 'twitter'|'reddit'; agent: string; content: string; round: number }> }` (last 50)
  - `ReportOutlineData = { title?: string; sections: Array<{ index: number; title: string; status: 'pending'|'writing'|'done' }> }`
  - `ReportEventData = { n: number; action: string; sectionIndex?: number; sectionTitle?: string; toolName?: string; summary: string; elapsedSeconds?: number }`
  - `SourcesData = { files: Array<{ id: string; filename: string; mediaType: string; sizeBytes: number }> }`
  - `ErrorData = { stage: Stage; code: string; message: string }`
  - `OpinionsDataParts = { stage, ontology, graph, agents, sim_feed, report_outline, report_event, sources, error }` and `OpinionsUIMessage` as before. `partIdFor(kind, payload)` helper. `assertStagesMatchDb()` test only.
- `events.ts`: `RunEventInput = { kind: EventKind; partId: string | null; payload: unknown }` and the discriminated `RunEventPayload` union keyed by kind (`report_text` payload `{ markdown: string }`, `done` payload `{}`).
- `projector/to-chunks.ts`: `eventToChunks(event: { kind; partId; payload }): UIMessageChunk[]` — pure mapping per Global Constraints: `report_text` → `[text-start{id:'report'}, text-delta{id:'report', delta: markdown}, text-end{id:'report'}]`; `error` → `[{type:'error', errorText: payload.message}]`; `done` → `[{type:'finish'}]`; others → one `data-<kind>` chunk with `id: partId`.

- [ ] **Step 1: Write failing tests** — `to-chunks.test.ts`: one `it` per kind asserting exact chunk arrays; `parts.test.ts`: every schema parses its happy example and `STAGES` equals the db `Stage` union (compile-time via a `satisfies` plus a runtime list compare).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `pnpm --filter @xo/engine test && typecheck` → PASS. **Step 5: Commit** `feat(engine): phase 1 part types, event schema, event-to-chunk projector`

---

### Task 5: RunStore interface, in-memory store, Drizzle store

**Files:**
- Create: `packages/engine/src/store/types.ts`, `packages/engine/src/store/memory.ts`, `packages/engine/src/store/drizzle.ts`
- Test: `packages/engine/src/store/memory.test.ts`, `packages/engine/src/store/drizzle.test.ts` (skips without `DATABASE_URL`)

**Interfaces:**
```ts
type RunStore = {
  create(input: { chatId; userId; assistantMessageId; config: RunConfig }): Promise<Run>
  get(id: string): Promise<Run | null>
  getActiveByChat(chatId: string): Promise<Run | null>           // status queued|running
  getLatestByChat(chatId: string): Promise<Run | null>
  claimNext(owner: string, leaseMs: number, maxConcurrent: number): Promise<Run | null>
  renewLease(id: string, owner: string, leaseMs: number): Promise<boolean>
  update(id: string, patch: Partial<Pick<Run,'status'|'stage'|'ids'|'cursors'|'error'|'attempt'|'envState'|'envKeepaliveUntil'|'startedAt'|'finishedAt'>>): Promise<Run>
  appendEvent(runId: string, event: RunEventInput): Promise<RunEvent>   // seq = previous max + 1, atomic
  listEvents(runId: string, afterSeq: number): Promise<RunEvent[]>
  setMessageParts(messageId: string, parts: unknown[]): Promise<void>
  listUploads(ids: string[]): Promise<Upload[]>
}
createMemoryStore(): RunStore & { runs: Map; events: Map; parts: Map }   // for tests
createDrizzleStore(db: Db): RunStore
```
- `claimNext` (Drizzle): single transaction: `SELECT ... FROM runs WHERE (status='queued' OR (status='running' AND lease_until < now())) AND (SELECT count(*) FROM runs WHERE status='running' AND lease_until >= now()) < $max ORDER BY queued_at LIMIT 1 FOR UPDATE SKIP LOCKED` then `UPDATE` to `running`, `lease_owner`, `lease_until`, `started_at = coalesce(started_at, now())`, `attempt + 1`. `appendEvent`: `INSERT ... SELECT coalesce(max(seq),0)+1` inside a transaction with the run row locked (`SELECT id FROM runs WHERE id=$1 FOR UPDATE`).

- [ ] **Step 1: Write failing tests** — memory: create/get/getActiveByChat/claim order/renew wrong owner false/appendEvent seq 1,2,3/listEvents afterSeq. Drizzle (same cases) plus **Review Focus 5**: `Promise.all([claimNext('a'), claimNext('b')])` with one queued run → exactly one non-null; with `maxConcurrent: 1` and one already running (fresh lease) → null; an expired lease is reclaimable.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** both suites (`DATABASE_URL=...`) → PASS. **Step 5: Commit** `feat(engine): run store (memory + drizzle) with skip-locked claiming`

---

### Task 6: Orchestrator state machine and stages

**Files:**
- Create: `packages/engine/src/orchestrator/types.ts`, `machine.ts`, `stages/ontology.ts`, `stages/graph-build.ts`, `stages/sim-create.ts`, `stages/sim-prepare.ts`, `stages/sim-run.ts`, `stages/report.ts`, `stages/index.ts`, `packages/engine/src/orchestrator/mirofish-map.ts`
- Test: `packages/engine/src/orchestrator/machine.test.ts`, `packages/engine/src/orchestrator/stages/*.test.ts`

**Interfaces:**
```ts
type Deps = { store: RunStore; mirofish: MiroFishClient; storage: Storage; now(): Date; log(msg: string, meta?: object): void }
type StageHandler = {
  stage: Stage
  hasEntered(run: Run): boolean                 // the stage's id is present in run.ids
  enter(run: Run, deps: Deps): Promise<Run>     // one MiroFish call; persist id via store.update BEFORE any appendEvent
  poll(run: Run, deps: Deps): Promise<Run>      // advance cursors, append events, and either stay or store.update({ stage: next })
}
tick(run: Run, deps: Deps): Promise<Run>        // picks handler by run.stage; enter if !hasEntered else poll; 'finished' → status done + done event
fail(run: Run, deps: Deps, stage: Stage, err: unknown): Promise<Run>  // status failed, error {stage, code, message}, stage event failed, error event
```
- `mirofish-map.ts`: pure functions `ontologyToPart(result): OntologyData`, `graphDataToPart(graphId, data): GraphData` (sample ≤200 nodes, keep edges among sampled), `profilesToPart(realtime): AgentsData`, `runStatusToFeed(prev: SimFeedData|undefined, status, newPosts): SimFeedData`, `agentLogToEvents(lines, startN): { outline?: ReportOutlineData; events: ReportEventData[]; complete: boolean }` (summary rules: `tool_call` → "Called <tool>"; `tool_result` → first 160 chars of a string result or "<tool> returned"; `llm_response` → "Thinking (iteration n)"; `section_start` → "Writing: <title>"; `section_complete` → "Finished: <title>"; `planning_complete` → "Outline ready (<k> sections)").
- Stage behaviour (events emitted via `deps.store.appendEvent`):
  - `ontology.enter`: emit `stage` running (`message: 'Reading your documents'`), `sources` from `listUploads`; download each upload via `storage.get(storageKey)`; `mirofish.graph.generateOntology({ files, requirement: config.requirement })`; `update({ ids: { projectId } })`; emit `ontology`; emit `stage` done; `update({ stage: 'graph_build' })`. (Synchronous stage: `enter` completes the whole stage; `poll` is never reached.)
  - `graph_build.enter`: `build({ projectId })` → if `reused && graph_id` → store `graphId`, emit stage done, next; else store `graphTaskId`. `poll`: `getTask` → `processing` → emit `stage` running with `progress`, `message` = task.message; `completed` → `graphId` from `result.graph_id`, `getData` → emit `graph`, stage done, next `sim_create`; `failed` → `fail`.
  - `sim_create.enter`: `create({ projectId, graphId })` → store `simulationId`; emit stage done; next `sim_prepare`.
  - `sim_prepare.enter`: `prepare({ simulationId })` → store `prepareTaskId` (or `already_prepared` → skip to done). `poll`: `prepareStatus` + `profilesRealtime` → emit `stage` running (progress from `progress`, message from `progress_detail.current_stage_name`) and `agents`; completed → stage done, next `sim_run`.
  - `sim_run.enter`: `start({ simulationId, maxRounds: config.maxRounds })` → store `ids.simulationId` already set; mark entered by `cursors.simStarted = true` (add to `RunCursors`); emit stage running. `poll`: `runStatus` → emit `stage` running `progress = progress_percent`, `message = "Round r/N"`; fetch new `posts` for both platforms using offsets in cursors; emit `sim_feed`; `completed|stopped` → stage done, next `report`; `failed` → `fail`.
  - `report.enter`: `generate({ simulationId })` → store `reportId`, `reportTaskId`; emit stage running. `poll`: `agentLog(reportId, cursors.agentLogLine)` → `agentLogToEvents` → emit `report_outline` (when changed) and one `report_event` per line (`partId report_event:<n>`); update cursor; when `complete` → `report.get` → if `completed` emit `report_text { markdown }`, stage done, next `finished`; if `failed` → `fail`.
  - `tick` when `stage === 'finished'`: `update({ status: 'done', finishedAt, envState: 'open' })`, emit `done`.
  - Any thrown `MiroFishError` with code `network|timeout|http` (status ≥ 500) → retry up to 3 times with backoff 2 s/4 s/8 s inside the stage (count in `cursors.retries`), then `fail`. `api|schema` → `fail` immediately.

- [ ] **Step 1: Write failing `machine.test.ts`** with `createMemoryStore()`, a stub `MiroFishClient` (plain object of `vi.fn()` per method, typed via `createMiroFishClientFromHttp`'s return type) and a stub storage. Cases: happy path through all stages ticking until `done` with exact stage event sequence; **Review Focus 2**: `sim_run.enter` → `store.update` called with `cursors.simStarted` before any `appendEvent` (spy order) and a run loaded with `cursors.simStarted` never calls `start`; resume from each stage with ids present calls only `poll`; `getTask` returning `failed` → run `failed`, `error.stage === 'graph_build'`, last two events `stage(failed)` + `error` (**Review Focus 4**); `timeout` error on `runStatus` retried 3× then failed; `api` error fails immediately.
- [ ] **Step 2: Write failing `mirofish-map` tests** — sampling caps nodes at 200 and drops dangling edges; `agentLogToEvents` on the Phase 0 agent-log fixture yields an outline with 3 sections and `complete: true`; summary strings as specified.
- [ ] **Step 3: Run** → FAIL. **Step 4: Implement.** **Step 5: Run** `pnpm --filter @xo/engine test && typecheck` → PASS. **Step 6: Commit** `feat(engine): idempotent orchestrator with six stage handlers`

---

### Task 7: Projector tail stream and materialiser

**Files:**
- Create: `packages/engine/src/projector/tail.ts`, `packages/engine/src/projector/materialise.ts`
- Modify: `packages/engine/src/index.ts`
- Test: `packages/engine/src/projector/tail.test.ts`, `packages/engine/src/projector/materialise.test.ts`

**Interfaces:**
- `tailRunAsUIMessageStream(input: { store: RunStore; runId: string; messageId: string; pollMs?: number (default 1000); maxDurationMs?: number; signal?: AbortSignal }): ReadableStream<UIMessageChunk>` — `createUIMessageStream<OpinionsUIMessage>`: writes `start{messageId}`, then loops `listEvents(afterSeq)` → `eventToChunks` → `writer.write`; stops after writing the chunks of a `done` or `error` event (which end the message), or when `signal` aborts / `maxDurationMs` elapses (then ends WITHOUT `finish`, so a reconnect replays from seq 0). Idle poll backs off 1 s → 2 s after 30 s idle.
- `materialiseRun(store: RunStore, runId: string): Promise<OpinionsUIMessage['parts']>` — replays all events through `tailRunAsUIMessageStream` with `pollMs: 0` into `readUIMessageStream`, takes the last message's `parts`, calls `store.setMessageParts(run.assistantMessageId, parts)`, returns parts. Used by the worker after every stage transition and at `done|failed`.

- [ ] **Step 1: Write failing tests** — tail: events appended over time are streamed in order; a `stage` event with the same `partId` twice yields two chunks with the same `id`; `done` ends with `finish`; `error` ends with `error` then `finish`; `maxDurationMs: 50` on an idle run ends without `finish`; abort signal ends without `finish`. Materialise: after a full happy-path event log the parts contain exactly 7 `data-stage`, one each of the other data parts, and one `text` part equal to the report markdown (**Review Focus 4** second half: after `fail`, parts contain the failed stage and a `data-error`? No — `error` is a stream-level chunk; the failed state lives in the `data-stage` part with `status:'failed'`; assert that).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS. **Step 5: Commit** `feat(engine): run_events tail projector and assistant message materialiser`

---

### Task 8: `@xo/storage`

**Files:**
- Create: `packages/storage/package.json`, `tsconfig.json`, `vitest.config.ts`, `src/index.ts`, `src/types.ts`, `src/local.ts`, `src/s3.ts`, `src/from-env.ts`
- Test: `packages/storage/src/local.test.ts`, `packages/storage/src/s3.test.ts`

**Interfaces:**
- `Storage = { put(key: string, bytes: Uint8Array, contentType: string): Promise<void>; get(key: string): Promise<Uint8Array>; delete(key: string): Promise<void> }`
- `createLocalStorage(rootDir: string): Storage` (keys are sanitised: reject `..` and absolute paths with `StorageError('invalid_key')`; files under `rootDir/<key>`; `mkdir -p`).
- `createS3Storage(opts: { bucket; region; endpoint?; accessKeyId; secretAccessKey; forcePathStyle?: boolean }, client?: S3Client): Storage`.
- `createStorageFromEnv(env: { STORAGE_DRIVER; STORAGE_LOCAL_DIR; S3_* }): Storage`.
- `uploadKey(userId, uploadId, filename): string` = `uploads/<userId>/<uploadId>/<safe filename>` (filename sanitised to `[A-Za-z0-9._-]`, max 120 chars).

- [ ] **Step 1: Write failing tests** — local: put/get round-trip bytes in a temp dir, delete removes, `get` missing → `StorageError('not_found')`, `put('../x')` throws `invalid_key`. S3: inject a stub `S3Client` whose `send` records commands; assert `PutObjectCommand` input `{Bucket, Key, Body, ContentType}` and `GetObjectCommand` body is read to bytes.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS. **Step 5: Commit** `feat(storage): local and s3 storage adapters`

---

### Task 9: Worker app

**Files:**
- Create: `apps/worker/package.json`, `tsconfig.json`, `vitest.config.ts`, `src/env.ts`, `src/main.ts`, `src/loop.ts`, `src/log.ts`
- Modify: `turbo.json` (worker `dev` persistent), root `package.json` (`dev` runs web + worker via turbo)
- Test: `apps/worker/src/loop.test.ts`, `apps/worker/src/e2e.test.ts` (skips without `DATABASE_URL`)

**Interfaces:**
- `runWorkerLoop(deps: Deps & { owner: string; leaseMs: number; pollMs: number; maxConcurrent: number; signal: AbortSignal }): Promise<void>` in `loop.ts`: loop `claimNext` → while run active: `renewLease`, `tick`, `materialiseRun` after each stage change and at terminal status, sleep `pollMs` between polls; on `tick` throwing an unexpected error → `fail(run, 'internal')`. When nothing to claim sleep `pollMs`. Exits when `signal` aborts.
- `main.ts`: `loadRootEnv`, parse worker env (Zod: `DATABASE_URL`, `MIROFISH_URL`, `MIROFISH_TOKEN?`, `STORAGE_*`, `WORKER_POLL_MS`, `MAX_CONCURRENT_RUNS`, `WORKER_ID`), build `createDrizzleStore(createDb(url))`, `createMiroFishClient`, `createStorageFromEnv`, run loop; SIGINT/SIGTERM abort. Scripts: `dev: tsx watch src/main.ts`, `start: tsx src/main.ts`, `test`, `typecheck`.

- [ ] **Step 1: Write failing `loop.test.ts`** with memory store + stub client: a queued run is claimed, ticked to `done`, `setMessageParts` called at least once per stage transition; lease renewed each tick; a run whose tick throws a non-MiroFish error ends `failed` with `code: 'internal'`; loop exits on abort.
- [ ] **Step 2: Write failing `e2e.test.ts`**: starts `startMockMiroFish({ port: 0, speed: 50 })`, real Drizzle store on `DATABASE_URL`, local storage in a temp dir, creates a user/chat/message/upload (one small `.txt`), a queued run with `maxRounds: 2`; runs `runWorkerLoop` with a 60 s abort; asserts run `done`, `run_events.seq` contiguous 1..n, last event `done`, the assistant message's `parts` contain a `text` part with the mock report. Then a second case: start the loop, abort it when `stage === 'sim_run'`, assert `start` was called once on the mock (mock exposes `calls` counter), restart the loop, assert done and `start` still called once (**Review Focus 2** end to end).
- [ ] **Step 3: Run** → FAIL. **Step 4: Implement.** **Step 5: Run** `pnpm --filter worker test` (with `DATABASE_URL`) `&& typecheck` → PASS. **Step 6: Commit** `feat(worker): claim/lease/tick loop with materialisation`

---

### Task 10: Upload route

**Files:**
- Create: `apps/web/src/app/api/uploads/route.ts`, `apps/web/src/server/uploads.ts`, `apps/web/src/lib/storage.ts`
- Test: `apps/web/src/app/api/uploads/route.test.ts`, `apps/web/src/server/uploads.test.ts`

**Interfaces:**
- `validateUploads(files: Array<{ name: string; type: string; size: number }>, existingCount: number): { ok: true } | { ok: false; reason: 'too_many' | 'too_large' | 'bad_type' }` (pure; limits from Global Constraints; media type inferred from extension when type is empty or `application/octet-stream`).
- `POST /api/uploads` multipart with `chatId` and `files`: session 401; `getOwnedChat` 404; `validateUploads` → 400 `{ error: 'upload_rejected', reason }` **before any storage write** (**Review Focus 3**); then for each file `storage.put(uploadKey(...))` and insert `uploads` row; returns 201 `{ uploads: [{ id, filename, mediaType, sizeBytes }] }`. `lib/storage.ts` exports `storage = createStorageFromEnv(env)`.

- [ ] **Step 1: Write failing tests** — `uploads.test.ts`: 6 files → `too_many`; 11 MB → `too_large`; `.exe` → `bad_type`; `.md` with empty type → ok. `route.test.ts` (mocks session/chats/storage/db like the Phase 0 route test): 401; 404; rejected upload → 400 and `storage.put` not called; happy path → 201 with one upload and `put` called with a key starting `uploads/<userId>/`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS. **Step 5: Commit** `feat(web): upload route with validation and storage`

---

### Task 11: Messages route drives a run

**Files:**
- Modify: `apps/web/src/app/api/chats/[id]/messages/route.ts`, `route.test.ts`, `apps/web/src/server/chats.ts`
- Create: `apps/web/src/server/runs.ts`, `apps/web/src/server/message-body.ts`
- Delete: `apps/web/src/server/echo-stream.ts`, `echo-stream.test.ts`

**Interfaces:**
- `message-body.ts`: `MessageBody` Zod schema `{ id: string; message: { id: string; role: 'user'; parts: unknown[] }; uploadIds?: string[] (default []); runOptions?: { maxRounds?: number (1..40, default 3) } }`; `parseMessageBody(json): MessageBody | null`; text extraction via `validateUIMessages`-free approach: filter `parts` with `type === 'text'` and string `text`.
- `runs.ts`: `runStore = createDrizzleStore(db)`; `startRun(input: { chatId; userId; message; uploadIds; maxRounds }): Promise<{ run: Run; assistantMessageId: string }>` in ONE transaction: insert user message with `onConflictDoNothing` (follow-up), insert assistant placeholder, `runStore.create(...)`. Catches the unique-partial-index violation and rethrows `RunActiveError`.
- Route order: 401 → 404 → `parseMessageBody` null → 400 `invalid_body` → empty text → 400 `empty_message` → `getActiveByChat` → 409 `run_active`; `getLatestByChat` status `done|failed`? `failed` runs allow a new run (retry); `done` → 409 `run_finished` → verify every `uploadId` belongs to this chat (else 400 `invalid_body`) → `startRun` → `createUIMessageStreamResponse({ stream: tailRunAsUIMessageStream({ store, runId, messageId, maxDurationMs: 280_000 }), headers: UI_MESSAGE_STREAM_HEADERS })`; `export const maxDuration = 300`.

- [ ] **Step 1: Write failing `route.test.ts`** — keep the 401/404/400 cases; add **Review Focus 1** (`getActiveByChat` returns a run → 409 `run_active`, `startRun` not called); `run_finished`; `invalid_body` on `{}`; upload id from another chat → 400; happy path → 200 `text/event-stream`, `startRun` called once with `maxRounds` default 3, and the first SSE line is `start` with the assistant message id.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `pnpm --filter web test && typecheck` → PASS. **Step 5: Commit** `feat(web): messages route enqueues a run and tails run_events`

---

### Task 12: Composer attachments and run options

**Files:**
- Modify: `apps/web/src/modules/chat/chat.tsx`
- Create: `apps/web/src/modules/chat/composer/composer.tsx`, `composer/use-uploads.ts`, `composer/run-options.tsx`
- Test: `apps/web/src/modules/chat/composer/use-uploads.test.ts`

**Interfaces:**
- `useUploads(chatId): { files: PendingFile[]; add(files: File[]): void; remove(id): void; uploadAll(): Promise<string[]> }` where `PendingFile = { localId; file; status: 'pending'|'uploading'|'done'|'error'; uploadId?; error? }`; `uploadAll` POSTs to `/api/uploads` (one request, all pending files) and returns upload ids; `fetch` injectable for tests.
- `<Composer chatId onSend(text, uploadIds, runOptions) disabled>`: AI Elements `PromptInput` + `PromptInputHeader`/`Attachments` (via `usePromptInputAttachments` if present in the vendored file, else our own list) + `PromptInputTextarea` + `PromptInputFooter` with `<RunOptions>` (shadcn `Select` for rounds 1,2,3,5,10,20,40; default 3) + `PromptInputSubmit`. On submit: `await uploadAll()` then `onSend`.
- `chat.tsx`: `sendMessage({ text, files? }, { body: { uploadIds, runOptions } })`; composer disabled while `status !== 'ready'` or a run is active (`initialRunActive` prop from the page).

- [ ] **Step 1: Write failing `use-uploads.test.ts`** (jsdom): `add` then `uploadAll` posts one multipart request with all files and returns ids; a failed response marks files `error` and rejects.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (install AI Elements `suggestion` for the empty state too). **Step 4: Run** → PASS; `pnpm --filter web build`. **Step 5: Commit** `feat(web): composer with attachments and run options`

---

### Task 13: Part components and dispatcher

**Files:**
- Create: `apps/web/src/modules/chat/parts/{ontology-card,graph-preview,agent-roster,simulation-feed,report-workbench,sources-list}.tsx`
- Modify: `apps/web/src/modules/chat/message-parts.tsx`, `apps/web/src/server/ui-message.ts` (validate `parts` with the engine Zod schemas per `data-*` type; drop unknown data parts), `apps/web/src/app/c/[id]/page.tsx` (pass `initialRunActive`)
- Install: AI Elements `reasoning artifact chain-of-thought tool sources` via the shadcn registry; dep `react-force-graph-2d@1.29.2`.
- Test: `apps/web/src/modules/chat/parts/{ontology-card,agent-roster,simulation-feed,report-workbench}.test.tsx`, `apps/web/src/modules/chat/message-parts.test.tsx`

**Interfaces (props = the data types from Task 4):**
- `<OntologyCard data: OntologyData>`: `Reasoning`/`ReasoningTrigger`/`ReasoningContent`; chips for entity and relation types (shadcn `Badge`); summary inside.
- `<GraphPreview data: GraphData>`: `Artifact`/`ArtifactHeader`/`ArtifactTitle` ("Knowledge graph · N nodes · M edges") + `ArtifactContent` with `next/dynamic`-loaded `react-force-graph-2d` (`ssr: false`), 240 px tall, nodes coloured by `type` hash.
- `<AgentRoster data: AgentsData>`: header "N of M personas"; grid of initials avatars with name + role; click opens shadcn `Sheet` with bio and topics.
- `<SimulationFeed data: SimFeedData>`: round progress line; shadcn `Tabs` Twitter/Reddit; `ScrollArea` of the last 50 posts.
- `<ReportWorkbench outline?: ReportOutlineData; events: ReportEventData[]>`: `ChainOfThought` with one `ChainOfThoughtStep` per outline section (status icon) and, under each, the events for that section rendered via `Tool`/`ToolHeader`/`ToolContent` for `tool_call`/`tool_result` (collapsed) and plain lines otherwise; collapsed by default once a `text` part exists.
- `<SourcesList data: SourcesData>`: `Sources`/`SourcesTrigger`/`SourcesContent`/`Source` with filename and size.
- `message-parts.tsx`: groups parts by type: all `data-stage` → `PipelineTimeline`; single `data-ontology|graph|agents|sim_feed|sources` → their cards (last occurrence wins); `data-report_outline` + all `data-report_event` → `ReportWorkbench`; `text` → `MessageResponse`; `data-error` → shadcn `Alert` destructive. Render order: sources, timeline, ontology, graph, agents, feed, workbench, text, error.

- [ ] **Step 1: Write failing tests** (jsdom): each card renders its key facts (chip count, "3 of 12 personas", post count, section titles); `message-parts.test.tsx`: given a parts array with 7 stage parts, 2 `data-agents` (last wins: count shown is the last), 3 `data-report_event`, one `text` → exactly one timeline, one roster showing the last count, a workbench with 3 events, one response.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `pnpm --filter web test && typecheck && build` → PASS. **Step 5: Commit** `feat(web): pipeline part components and dispatcher`

---

### Task 14: End-to-end verification and docs

**Files:**
- Modify: `README.md` (run the mock + worker + web; "Running against a real MiroFish"), `docs/superpowers/plans/2026-10-20-phase-0-followups.md` (tick folded items), `.github/workflows/ci.yml` (run `worker` tests with the DB service; `@xo/mirofish` mock test already in `pnpm test`)
- Create: `scripts/dev-all.sh` (starts mock MiroFish with `MOCK_SPEED=5`, worker, web via `concurrently`-free approach: three `pnpm` processes with `&` and `wait`, trap to kill) — or a turbo `dev` that includes the worker and a `mock` task; pick turbo: add `mock` script to root (`pnpm --filter @xo/mirofish mock`) and document running it in a second terminal.

- [ ] **Step 1: Run the stack**: `MOCK_SPEED=5 pnpm mock` (terminal 1), `pnpm dev` (web + worker, terminal 2). Browser: new conversation → attach a small `.txt` → ask a question → observe: sources list, stages flipping in order, ontology chips, graph preview, roster filling, feed scrolling by round, workbench steps, report text. Save `.context/phase1-run.jpg`.
- [ ] **Step 2: Worker restart mid-run**: kill the worker while the feed is at round 1 of 3, restart it; the run resumes, `start` is not re-called (mock logs show one `start`), the run completes.
- [ ] **Step 3: Failure path**: `MOCK_FAIL_STAGE=graph_build pnpm mock` (add this env to the mock: the named stage's task returns `failed` with message "Injected failure") → the timeline shows the failed stage with the message, the stream ends with an error, reload shows the failed stage persisted.
- [ ] **Step 4: Second message during a run** → composer disabled; `curl` POST returns 409 `run_active`.
- [ ] **Step 5: CI**: `pnpm typecheck && DATABASE_URL=... pnpm test && pnpm --filter web build` locally exit 0; push and confirm the workflow is green.
- [ ] **Step 6: Commit** `docs: phase 1 run instructions; ci runs worker tests`

---

## Self-review notes

- Spec Phase 1 coverage: parts ✔ (T4), machine/stages ✔ (T6), projector ✔ (T7), worker ✔ (T9), storage ✔ (T8), upload route ✔ (T10), messages route ✔ (T11), part components ✔ (T13), composer ✔ (T12), "kill+restart worker mid-run resumes without re-calling start" ✔ (T9 e2e + T14). Pulled forward from Phase 5: mock MiroFish (T2) because Phase 1 is otherwise unverifiable here and in CI. Pulled forward from Phase 2: `maxDurationMs` on the tail (T7/T11) because Vercel limits exist regardless; `GET /stream` resume and page-loader changes remain Phase 2.
- Deviations from spec: `runs.cursors.simStarted` marks `sim_run` entry (the spec keyed entry on an id, but `start` returns no new id); `report_text` is one event carrying the whole markdown (MiroFish delivers it whole); `interviews` table deferred to Phase 3; `data-queue`/`data-env` deferred to Phases 3–4.
- Names used consistently: `RunStore`, `createMemoryStore`, `createDrizzleStore`, `tick`, `fail`, `StageHandler`, `Deps`, `eventToChunks`, `tailRunAsUIMessageStream`, `materialiseRun`, `Storage`, `createStorageFromEnv`, `uploadKey`, `validateUploads`, `parseMessageBody`, `startRun`, `runWorkerLoop`, `startMockMiroFish`, part data type names and `data-*` kinds per Global Constraints.
- Unverified to confirm during T2/T6: exact MiroFish `profiles/realtime` item fields (mock uses `{agent_id, name, handle, role, bio, topics}`; map defensively with optional fields); `posts` item fields; whether `start` with `force:true` on an already-running sim restarts it (we never call it twice by construction).
