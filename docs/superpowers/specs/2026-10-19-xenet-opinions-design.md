# Xenet Opinions: chat-first UI for MiroFish (clean-room, MIT)

## Context

MiroFish (github.com/666ghj/MiroFish, ~80k stars, AGPL-3.0) is a multi-agent public-opinion
simulator: docs + a question → LLM ontology → Zep Cloud GraphRAG graph → LLM-generated agent
personas → CAMEL OASIS simulates Twitter+Reddit for N rounds → ReACT report agent writes a
prediction report → user can chat with the report or interview agents. Its Vue UI is a 5-step
wizard with raw console panes, no auth, no tenancy, polling only. Hard to use.

Goal: an open-source chat-first web UI, "Xenet Opinions", that drives MiroFish over HTTP so a
user types a question, attaches documents, and watches the run unfold inside one chat thread,
with the report as the reply and follow-up questions answered by the report agent or by the
simulated agents. Purpose: community attention for Xenet. Workspace repo is empty.

## Feasibility verdict

Feasible. MiroFish is fully drivable over plain HTTP (verified from source: Flask 3 on :5001,
`/api/graph`, `/api/simulation`, `/api/report`; every long job = thread + poll endpoint; its
own Vue UI is just a polling client). Its Step 5 already has report-chat and agent-interview
endpoints. Two constraints shaped the decisions below:

- **TurboStarter AI is a private, paid, proprietary EULA.** Open-source derivatives need
  written licensor approval; a bundled script detects public remotes and threatens takedown.
  → Decision: **clean-room rebuild on public MIT/Apache primitives.** Mirror only the
  architecture shape. `XenetDev/xenetgo` (private turbostarter copy) is reference only and
  must never be a git ancestor of this repo. No code is copied from it.
- **MiroFish is AGPL-3.0.** → UI repo talks HTTP only, never imports/vendors MiroFish code.
  Any backend patches live in a separate AGPL fork repo, pinned by image tag.

Decisions confirmed by the user (2026-10-19): clean-room rebuild; chat-first full pipeline
(one conversation = one MiroFish project); hosting **both** (docker-compose for self-hosters
and a Xenet-hosted public demo).

## MiroFish API we orchestrate (verified)

| Stage | Call | Progress source |
|---|---|---|
| ontology | `POST /api/graph/ontology/generate` multipart `files[]`, `simulation_requirement` | synchronous, minutes |
| graph build | `POST /api/graph/build {project_id}` → task | `GET /api/graph/task/<id>`; `GET /api/graph/data/<graph_id>` |
| sim create | `POST /api/simulation/create {project_id, graph_id}` | sync |
| sim prepare | `POST /api/simulation/prepare {simulation_id}` → task | `POST /api/simulation/prepare/status`, `GET /<sim>/profiles/realtime`, `/config/realtime` |
| sim run | `POST /api/simulation/start {simulation_id, platform:'parallel', max_rounds}` | `GET /<sim>/run-status`, `/actions`, `/posts`, `/comments` |
| report | `POST /api/report/generate {simulation_id}` → task | `GET /api/report/<id>/agent-log?from_line=N` (JSONL events), `GET /api/report/<id>` |
| follow-up | `POST /api/report/chat {simulation_id, message, chat_history}` (sync) | n/a |
| interview | `POST /api/simulation/interview/batch` (needs OASIS subprocess alive) | n/a |
| lifecycle | `POST /api/simulation/stop`, `POST /api/simulation/close-env` | |

Hard facts to design around: tasks are in-memory (lost on MiroFish restart); all state is
files under `backend/uploads`; process-local singletons ⇒ run exactly one MiroFish process;
no auth, CORS `*`; Zep Cloud mandatory; OpenAI-compatible LLM via `LLM_API_KEY/BASE_URL/
MODEL_NAME`; `/posts?platform=` has a path-traversal bug; 500s leak tracebacks.

## Architecture

```
browser ── useChat ──► apps/web (Next, Vercel or compose)      ── HTTP+token ──► MiroFish (Flask)
   ▲   UIMessageStream   │ POST /api/chats/:id/messages: persist, enqueue run,          ▲
   │   data-* parts      │   return tail stream of run_events                           │
   └─────────────────────┤ GET  /api/chats/:id/stream: same tail (resume)              │
                         ▼                                                              │
                      Postgres (chats, messages, runs, run_events, uploads, interviews) │
                         ▲                                                              │
                 apps/worker (Node loop, co-located with MiroFish) ─ polls 2s ──────────┘
                   claims runs, ticks idempotent state machine, writes run_events,
                   materialises assistant message parts, sweeps idle OASIS envs
```

Key idea: **Postgres `run_events` is the source of truth; the chat stream is a projector.**
Initial POST and reload-resume GET share one function that tails `run_events` from seq 0 and
emits AI SDK `data-*` parts with stable `id`s (in-place reconciliation), so replay is safe.
Report text is emitted once as `text-start/delta/end`. No Redis, no `resumable-stream`.
The worker makes every MiroFish call, so the 300 s+ ontology call never touches serverless.
On Vercel the tail route sets `maxDuration` and ends itself before the limit; the client polls
`GET /api/chats/:id/run` every 5 s and calls `resumeStream()` when a run is still active.

## Prior art considered: trendy-design/llmchat (MIT)

Evaluated 2026-10-19. Not a base, but worth borrowing from. Facts: MIT, 1.07k stars, last
commit 2025-04-17 (dormant ~18 months), Next 14 / React 18 / Tailwind 3 / Radix, LangChain +
early AI SDK, Clerk + Supabase + Prisma + Dexie (chat history in IndexedDB), no Cloudflare.
Its "workflow" runs **in a browser Web Worker** (`packages/ai/worker/worker.ts`) and emits
events to a `WorkflowEventSchema` of `steps{id,text,steps{status,data}}`, `toolCalls`,
`answer`, `sources` — the inverse of our server-side long-running model.
Borrow (re-implemented on AI Elements, attribution in NOTICE if any code is lifted):
- `packages/common/components/thread/step-renderer.tsx` + `step-status.tsx`: a thread item
  = ordered steps with PENDING/COMPLETED/ERROR dots, shimmer labels ("Searching", "Reading",
  "Analyzing"), badge rows for sub-items, staggered motion. Maps directly onto our
  `PipelineTimeline` (six stages) and `ReportWorkbench` (tool_call/tool_result rows).
- `thread/components/{goals,sources-stack,tool-call,tool-result,followup-suggestion}.tsx`
  as visual references for agent roster, sources, workbench, and follow-up chips.
- The "one thread item carries steps + answer + sources" mental model, which matches our
  "one assistant turn carries the whole run" design.
Why not fork: stale stack would need a Next 14→16 / React 18→19 / Tailwind 3→4 migration
larger than the scaffold itself; client-side orchestration and IndexedDB persistence conflict
with multi-device resume and a hosted queue; LangChain and Clerk/Supabase are dead weight.

## Monorepo layout

```
apps/web        Next App Router + route handlers; shadcn + AI Elements vendored into src/components
apps/worker     Node loop: claim/lease runs, tick, sweeper (tsx in dev, Dockerfile in prod)
packages/db     Drizzle schema + migrations + client
packages/mirofish  Typed MiroFish client (Zod envelopes, error normalisation, timeouts, multipart)
packages/engine Pure TS: parts.ts (UIMessage data part types), orchestrator/ (state machine),
                projector/ (run_events → UI stream), policy/ (quota, queue)
packages/storage  put/get adapters: s3 (S3/MinIO/R2) and local disk
packages/config tsconfig/eslint presets
infra/docker    Dockerfile.web, Dockerfile.worker, docker-compose.yml (web, worker, postgres,
                minio, mirofish; MiroFish on internal network only)
infra/mirofish  README: AGPL fork repo, pinned image tag, required env
```

Stack: pnpm + Turborepo 2, Node 22/24, Next 16, React 19, Tailwind 4, Vercel AI SDK
(`ai` 6.x verified locally at 6.0.282; decide 6 vs 7 at scaffold time), `@ai-sdk/react`,
AI Elements via `pnpm dlx ai-elements@latest add …`, Streamdown, Drizzle + `postgres`,
Better Auth with `anonymous` plugin, Zod 4, Vitest, `@aws-sdk/client-s3`. No Hono (Next route
handlers suffice), no i18n, no credits, no mobile.

## Data model (`packages/db/src/schema/`)

- `auth.ts`: Better Auth tables (generated).
- `chats.ts`: `chats(id, user_id, title, created_at, updated_at)`;
  `messages(id, chat_id, role, parts jsonb, created_at)` — parts stored verbatim.
- `runs.ts`: `runs(id, chat_id, user_id, assistant_message_id, status queued|running|done|
  failed|cancelled, stage ontology|graph_build|sim_create|sim_prepare|sim_run|report|finished,
  config jsonb{requirement,max_rounds,upload_ids}, ids jsonb{project_id,graph_id,graph_task_id,
  simulation_id,prepare_task_id,report_id,report_task_id}, cursors jsonb{agent_log_line,
  last_round,last_action_idx}, error jsonb{stage,code,message}, attempt, lease_owner,
  lease_until, env_state none|open|closed, env_keepalive_until, queued_at, started_at,
  finished_at)`;
  `run_events(id, run_id, seq, kind, part_id, payload jsonb, created_at) unique(run_id,seq)`;
  `uploads(id, user_id, chat_id, storage_key, filename, media_type, size_bytes)`;
  `interviews(id, chat_id, run_id, agent_id, agent_name, question, answer)`.

## Orchestrator (`packages/engine/src/orchestrator/`)

`tick(run, {mirofish, store})`: each stage has `enter()` guarded by "the stage's id in
`runs.ids` is null" (idempotent on crash/duplicate) and `poll()` every 2 s advancing cursors
and appending `run_events`. Failure ⇒ `status=failed`, `error={stage,code,message}`; retry
endpoint re-queues keeping ids of completed stages and nulling the failed stage's id, so
MiroFish's own reuse behaviour (`reused`, `already_prepared`) makes re-entry cheap.
Worker loop: `claim()` via `FOR UPDATE SKIP LOCKED` with lease renewal and a concurrency gate
(`MAX_CONCURRENT_RUNS`, default 1); sweeper every 60 s closes OASIS envs past
`env_keepalive_until` (default 20 min after report, extended 10 min per interview, cap 60)
and marks runs whose MiroFish task vanished (backend restart) as failed with a retry.

Data part types (`packages/engine/src/parts.ts`, shared by projector and UI):
`data-queue`, `data-stage` (×6, id `stage:<name>`), `data-ontology`, `data-graph`,
`data-agents`, `data-sim_feed`, `data-report_outline`, `data-report_event:<n>`,
`data-sources`, `data-env`, `data-interview`, `data-error`; `text` for the report.

## MiroFish client (`packages/mirofish/`)

`client.ts` (fetch wrapper: base URL, `X-MiroFish-Token`, `AbortSignal.timeout`, JSON +
multipart, Zod parse), `errors.ts` (`MiroFishError` codes api|http|timeout|network|schema;
traceback kept for server logs, never written to events), `schemas/{common,graph,simulation,
report}.ts` (loose objects, only fields we read are typed; `platform` is `z.enum(['twitter',
'reddit'])`), `endpoints/{graph,simulation,report}.ts`, `fixtures/` captured from a real run
for contract tests. Timeouts: 30 s default, 600 s ontology, 200 s interview, 180 s report chat.

## UI (`apps/web/src/modules/chat/`)

AI Elements where they exist: `Conversation*`, `Message*` (+ `MessageResponse` Streamdown),
`PromptInput*` + `Attachments*`, `Task*` (pipeline timeline), `Reasoning*` (ontology
summary), `Artifact*` (graph preview shell), `Tool*` + `ChainOfThought*` (report workbench),
`Sources*`, `Shimmer`, `Suggestion*` (empty state), shadcn `Sidebar` for history.
Custom: `parts/{pipeline-timeline,ontology-card,graph-preview (lazy react-force-graph-2d),
agent-roster,simulation-feed,report-workbench,interview-card,env-badge,queue-position}.tsx`,
`composer/{run-options (rounds, platforms),target-selector (report vs @agents)}.tsx`,
`message-parts.tsx` (`switch (part.type)` dispatcher), `chat.tsx` (`useChat` +
`DefaultChatTransport` with `prepareReconnectToStreamRequest` → `/api/chats/:id/stream`),
`use-run.ts` (status poll + `resumeStream()`).

Uploads: composer → `POST /api/uploads` (validates pdf/md/txt, size, count) → storage
adapter → `sendMessage({text, files}, {body:{uploadIds, runOptions}})`; worker downloads
from storage and forwards multipart to MiroFish. Presigned PUT for hosted S3 to avoid the
4.5 MB Vercel body limit.

## Hosted-demo policy (`packages/engine/src/policy/`)

FIFO queue, concurrency 1, `data-queue {position, eta}` part; per-anonymous-user quota: one
active run, `MAX_RUNS_PER_DAY` 2, rounds cap 3, 10 MB / 5 files; MiroFish reachable only from
worker + web via token behind a reverse proxy; `DEMO_PAUSED=1` kill switch; host-side cron
for `backend/uploads` retention.

## MiroFish fork (separate AGPL repo, minimal patches)

1. `X-MiroFish-Token` shared-secret middleware (skipped when env unset).
2. Sanitise `platform` to `{twitter, reddit}`.
3. Strip `traceback` from 500 bodies unless debug.
4. Refuse to boot under multi-worker servers (document single process).
Nothing else: no SSE, no auth model, no DB.

## Phases

0. **Scaffold + client + echo chat**: workspace files, `packages/{config,db,mirofish}`,
   `apps/web` with Better Auth anonymous + shadcn + AI Elements, echo route using
   `createUIMessageStream` with one `data-stage` part, compose with Postgres only.
   Verify: anonymous cookie set, echoed stream renders; `mirofish` tests parse fixtures
   captured from a local MiroFish run (`scripts/capture-fixtures.ts`).
1. **Full pipeline happy path**: `packages/engine` (parts, machine, stages, projector),
   `apps/worker`, `packages/storage`, upload route, messages route, all part components.
   Verify: PDF + question → stages flip in place, graph/roster/feed/report render;
   `run_events.seq` contiguous; kill+restart worker mid-run resumes without re-calling start.
2. **Reload/resume + persistence**: `GET /stream` tail, chat page loader (omit in-flight
   assistant message when run active), `use-run.ts`, worker materialise on transitions,
   cancel/retry routes, sidebar history.
   Verify: reload at every stage identical within 2 s; forced `maxDuration=60` reattaches;
   retry after injected failure re-enters only that stage.
3. **Follow-ups + interviews**: route branch → `report.chat` streamed as text chunks, or
   `interviewBatch` → `data-interview` parts; keepalive extension; `interviews` table;
   `target-selector`, `env-badge`.
   Verify: follow-up streams; 3-agent interview fills; past keepalive → friendly error,
   report chat still works.
4. **Self-host + hosted demo**: Dockerfiles, full compose, `infra/mirofish/README.md`,
   quota/queue policy, health route, `vercel.json` maxDuration, `docs/hosting.md`.
   Verify: clean-machine `docker compose up` full run with only web port exposed; second
   browser sees "#2 in queue"; quota message on third run; MiroFish without token → 401.
5. **Open-source readiness**: README (architecture, MIT/AGPL boundary, quickstart),
   CONTRIBUTING, SECURITY, CI (typecheck, lint, vitest, docker build), optional
   `LISTEN/NOTIFY`, `MIROFISH_MOCK=1` fixture-replay mode for UI dev and CI, a11y pass.
   Verify: CI green on a fork; fresh-clone quickstart under 10 min; license checker clean.

First implementation step: commit this design as `docs/superpowers/specs/2026-10-19-xenet-
opinions-design.md`, then produce the Phase 0 task plan via superpowers:writing-plans.

## Risks

- Mid-run LLM/Zep failures (JSON-mode fragility, Zep 429s): stage-scoped failure + retry-
  from-stage; 3× backoff on network/timeout/5xx; skip unparsable agent-log lines.
- MiroFish restart loses tasks: sweeper detects and fails with `backend_restarted` + retry.
- Resumed stream merging into the existing assistant message: design does not depend on it
  (loader omits in-flight message; stream rebuilds from seq 0). Verify in Phase 2.
- AI SDK 6 vs 7 drift: all stream writing isolated in `projector/ui-stream.ts`, all client
  config in `chat.tsx`.
- Zep Cloud is unavoidable for self-hosters: document; mock mode for development.
- Hosted cost: conservative quotas, estimate shown before run, `DEMO_PAUSED` switch.

## Unverified items to confirm during Phase 0/1

Exact multipart field names for ontology; reuse-flag names; whether two OASIS subprocesses
can coexist (keep concurrency 1 until proven); AI Elements `PromptInput` upload hook;
`@ai-sdk/react` major matching the chosen `ai` major.
