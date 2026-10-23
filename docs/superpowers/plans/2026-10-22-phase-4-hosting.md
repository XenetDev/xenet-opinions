# Xenet Opinions Phase 4: Self-host Bundle and Hosted Demo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Anyone can run the whole product with one `docker compose up` (web, worker, Postgres, MinIO, MiroFish behind a token proxy, only the web port exposed), and Xenet can run a public demo on Vercel plus a container host with a FIFO queue, per-user quotas, a kill switch and a health route.

**Architecture:** The hosted-demo policy is pure engine code (`packages/engine/src/policy/`) checked by the web routes before a run is created; the queue position is derived from `runs` (runs ahead by `queued_at`) and projected as a transient `data-queue` part by the tail while a run is still `queued`, plus a `queuePosition` field on `GET /run` so reattach keeps it. MiroFish runs unmodified from a pinned upstream commit in its own image, reachable only through a Caddy sidecar that rejects requests without the shared `X-MiroFish-Token` header; this replaces the spec's fork patch #1 for now (the fork stays optional, see Global Constraints). Web ships as a Next standalone image, the worker as a Node image that also runs migrations through a small `drizzle-orm` migrator (no `drizzle-kit` at runtime). A `mock` compose profile swaps MiroFish for our mock so the full stack boots and completes a run with no keys.

**Tech Stack:** unchanged app stack (Next 16.4, `ai` 7.0.143, Drizzle 0.45, Node 24, pnpm 10.30). New: Docker multi-stage images (`node:24-slim`), `caddy:2` sidecar, `minio/minio` + `minio/mc`, `postgres:18`, MiroFish image built from `python:3.11-slim` + `uv` at upstream commit `7657031ac01184afe2cb220f5ee3545573b5e843` (2026-10-01). Hosted: Vercel (web, Pro plan for 300 s functions), a container host for mirofish + proxy + worker + Postgres (Railway preferred; Fly or a VM equivalent), S3-compatible uploads (R2 or S3).

**Spec:** `docs/superpowers/specs/2026-10-19-xenet-opinions-design.md` (Hosted-demo policy; MiroFish fork; Phase 4). Binding inputs: `docs/superpowers/plans/2026-10-21-phase-3-followups.md` "Phase 4 design notes" (Vercel 60 s Hobby cap; chat delete does not close env; worker/storage vars missing from turbo `globalEnv`).

## Global Constraints

- MIT clean-room. MiroFish is AGPL: our repo never vendors or patches its code. `infra/mirofish/Dockerfile` clones upstream at `ARG MIROFISH_REF=7657031ac01184afe2cb220f5ee3545573b5e843` and runs it unmodified; the spec's fork patches are deferred (token = Caddy sidecar; traceback stripping and platform sanitising are unverified against real MiroFish and stay in the Phase 4 followups).
- Policy constants (`packages/engine/src/policy/quota.ts`): `MAX_RUNS_PER_DAY = 2`, `DEMO_MAX_ROUNDS = 3`, `QUOTA_WINDOW_MS = 24 * 60 * 60 * 1000`. Upload limits already enforced (5 files, 10 MB each). Concurrency stays `MAX_CONCURRENT_RUNS=1`.
- Web env (`apps/web/src/env.schema.ts`): `DEMO_MODE` (`'1'|'0'`, default `'0'`), `DEMO_PAUSED` (`'1'|'0'`, default `'0'`), `MAX_RUNS_PER_DAY` (int, default 2), `DEMO_MAX_ROUNDS` (int 1..40, default 3). Quota and rounds cap apply only when `DEMO_MODE='1'`; `DEMO_PAUSED='1'` blocks new runs regardless of `DEMO_MODE`. Follow-ups, cancel and retry are never blocked by quota or pause. Retry does not consume quota.
- Error bodies: `409 { error: 'demo_paused' }`, `429 { error: 'quota_exceeded', resetAt: <ISO> }`, `400 { error: 'rounds_exceeded', max: <n> }`, checked in that order after the existing `run_active` check and before `startRun`. Notices: `demo_paused` → "The demo is paused right now. Try again later."; `quota_exceeded` → "You've used today's two runs. Come back tomorrow."; `rounds_exceeded` → "The demo allows up to 3 rounds."
- Queue: `RunStore.queuePosition(runId): Promise<number | null>` = `1 + count(runs where status in ('queued','running') and queued_at < this.queued_at)` for a `queued` run, `null` otherwise. New data part `data-queue` with payload `{ position: number }` (schema `QueueDataSchema`), part id `queue`, NOT an event kind: `tailRunAsUIMessageStream` accepts `queuePosition?: () => Promise<number | null>` and, while no event has been written yet, writes `{ type:'data-queue', id:'queue', data:{ position } }` once per poll when the value changes; when the first real event arrives it writes `{ position: 0 }`. `materialiseRun` never includes it (it is not in `run_events`). `ui-message.ts` whitelists `data-queue` so a stale part is tolerated on load. `GET /api/chats/:id/run` adds `queuePosition: number | null`. Client: `QueueCard` renders "You are #N in the queue" when the last `data-queue` part has `position >= 1` and no `stage` part exists; hidden otherwise; the pipeline timeline is not shown while queued.
- Health: `GET /api/health` (nodejs runtime, no auth) → `200 { ok: true, db: 'ok', mirofish: 'ok' | 'skipped' }` or `503 { ok: false, db: 'ok'|'error', mirofish: 'ok'|'error'|'skipped' }`; `db` = `select 1`; `mirofish` = `GET ${MIROFISH_URL}/health` with a 3 s timeout, `'skipped'` when `HEALTH_CHECK_MIROFISH='0'` (default `'1'`). Never includes URLs, tokens or error text.
- Images: `infra/docker/Dockerfile.web` (multi-stage: `pnpm install --frozen-lockfile`, `pnpm --filter web build` with `next.config.ts` `output: 'standalone'` and `outputFileTracingRoot` = repo root; runtime stage copies `.next/standalone`, `.next/static`, `public`; `ARG NEXT_PUBLIC_APP_URL` is required at build; `CMD ["node","apps/web/server.js"]`, port 3000, `HOSTNAME=0.0.0.0`). `infra/docker/Dockerfile.worker` (`pnpm install --frozen-lockfile --prod` after moving `tsx` to `dependencies` of `apps/worker` and `packages/db`; `CMD ["pnpm","--filter","worker","start"]`; the same image runs `pnpm --filter @xo/db db:migrate:prod`). `.dockerignore` excludes `node_modules`, `.next`, `.data`, `.superpowers`, `.context`, `.git`.
- Migrator: `packages/db/src/migrate.ts` runs `migrate(drizzle(postgres(DATABASE_URL, { max: 1 })), { migrationsFolder })` and exits 0/1; script `db:migrate:prod` = `tsx src/migrate.ts`. `drizzle-kit` stays a devDependency.
- Compose (`infra/docker/docker-compose.yml`, run from repo root with `docker compose -f infra/docker/docker-compose.yml --env-file .env.selfhost up`): services `postgres` (volume), `minio` (volume, console not published), `minio-init` (creates bucket `xo-uploads`), `mirofish` (profile `real`; volume `mirofish-uploads:/app/backend/uploads`; env from `.env.selfhost`: `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL_NAME`, `ZEP_API_KEY`), `mirofish-mock` (profile `mock`; worker image running `tsx packages/mirofish/mock/server.ts` with `HOST=0.0.0.0 MOCK_TOKEN=${MIROFISH_TOKEN}`), `mirofish-proxy` (`caddy:2`, Caddyfile from `infra/mirofish/Caddyfile`, upstream `${MIROFISH_UPSTREAM}` = `mirofish:5001` or `mirofish-mock:5001`, rejects any request whose `X-MiroFish-Token` header ≠ `{$MIROFISH_TOKEN}` with `401 {"success":false,"error":"unauthorized"}`, passes `/health` without token), `migrate` (worker image, one-shot, `depends_on postgres healthy`), `worker` (`depends_on migrate completed`, `MIROFISH_URL=http://mirofish-proxy:8080`), `web` (`ports: "${XO_WEB_PORT:-3000}:3000"`, `depends_on migrate completed`). Only `web` publishes a port. Networks: `edge` (web), `internal` (everything); `mirofish` and `mirofish-mock` join `internal` only and the proxy is the only service that talks to them.
- `.env.selfhost.example` lists every variable the compose file reads with safe defaults except secrets (`BETTER_AUTH_SECRET`, `MIROFISH_TOKEN`, `LLM_API_KEY`, `ZEP_API_KEY` left blank) and `NEXT_PUBLIC_APP_URL=http://localhost:3000`.
- Mock server: binds `process.env.HOST ?? '127.0.0.1'`.
- Retention: `infra/mirofish/retain.sh` deletes `backend/uploads/simulations/*` and `backend/uploads/projects/*` (whatever upstream creates; check the volume after a run) older than `RETAIN_DAYS` (default 7); documented as a host cron, not a compose service.
- Vercel: `apps/web/vercel.json` = `{ "$schema": "https://openapi.vercel.sh/vercel.json", "functions": { "src/app/api/**/*.ts": { "maxDuration": 300 } } }`; `docs/hosting.md` states Hobby's 60 s cap breaks runs and follow-ups, so Pro is required.
- turbo `globalEnv` adds: `STORAGE_DRIVER`, `STORAGE_LOCAL_DIR`, `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`, `WORKER_POLL_MS`, `MAX_CONCURRENT_RUNS`, `WORKER_ID`, `DEMO_MODE`, `DEMO_PAUSED`, `MAX_RUNS_PER_DAY`, `DEMO_MAX_ROUNDS`, `HEALTH_CHECK_MIROFISH`.
- CI adds a `docker` job: `docker build -f infra/docker/Dockerfile.web --build-arg NEXT_PUBLIC_APP_URL=http://localhost:3000 .` and `docker build -f infra/docker/Dockerfile.worker .` (no push).
- Comments: none unless documenting an invariant the code cannot express; single-line only. All Phase 0–3 tests keep passing.

## Review Focus

1. Queue position is honest: a run behind one running and one queued run shows #3, drops as runs finish, and the card disappears the moment the first stage event streams, including after a reattach through `/stream`. (Task 1 tail tests; Task 2 `/run` + QueueCard tests)
2. Quota counts only this user's runs in the last 24 h, exempts retry, and `DEMO_PAUSED` blocks new runs but not follow-ups, cancel or retry. (Task 2 route + `runsStartedSince` db tests)
3. The proxy is the only path to MiroFish: a request without the token gets 401, `/health` passes, and MiroFish's port is not published or reachable from the web container. (Task 5 Caddyfile test via `caddy validate` + Task 7 compose checks)
4. The web image serves with env supplied only at runtime (no `.env` in the image) except `NEXT_PUBLIC_APP_URL`, which is a build arg; the worker image resolves `STORAGE_LOCAL_DIR` only when absolute and otherwise uses S3. (Task 4 build + Task 7 compose run)
5. Health never leaks: with MiroFish down it returns 503 and a one-word status, no URL, no stack. (Task 3 route tests)

---

### Task 1: Policy module, queue position, transient `data-queue` part

**Files:**
- Create: `packages/engine/src/policy/quota.ts`, `packages/engine/src/policy/quota.test.ts`, `packages/engine/src/policy/index.ts`
- Modify: `packages/engine/src/parts.ts` (`QueueDataSchema`, `QueueData`, `OpinionsDataParts.queue`), `packages/engine/src/store/types.ts` (`queuePosition`), `store/memory.ts`, `store/drizzle.ts`, `packages/engine/src/projector/tail.ts` (`queuePosition?` option), `packages/engine/src/index.ts`
- Test: `parts.test.ts`, `store/memory.test.ts`, `store/drizzle.test.ts`, `projector/tail.test.ts`

**Interfaces:**
- Produces: `checkRunPolicy(input: { demoMode: boolean; paused: boolean; runsInWindow: number; maxRunsPerDay: number; requestedRounds: number; maxRounds: number; windowStartedAt: Date }): { ok: true } | { ok: false; code: 'demo_paused' | 'quota_exceeded' | 'rounds_exceeded'; resetAt?: Date; max?: number }` — `resetAt = windowStartedAt + QUOTA_WINDOW_MS` where `windowStartedAt` is the oldest counted run's `queued_at`; checks in order paused → quota → rounds; when `demoMode` is false only `paused` applies.
- `RunStore.queuePosition(runId: string): Promise<number | null>` per Global Constraints.
- `tailRunAsUIMessageStream({ ..., queuePosition?: () => Promise<number | null> })`.
- `QueueDataSchema = z.object({ position: z.number().int().min(0) })`.

- [ ] **Step 1: Write failing tests** — quota: paused wins over everything; `runsInWindow >= maxRunsPerDay` → `quota_exceeded` with `resetAt = windowStartedAt + 24h`; `requestedRounds > maxRounds` → `rounds_exceeded` with `max`; `demoMode:false` + not paused → ok even with 10 runs and 40 rounds. store (memory + drizzle): three runs queued at t0 (running), t1, t2 → positions `null`, 2, 3; a `done` run → `null`; after the t1 run is claimed, t2 → 2. tail: with `queuePosition` resolving 2 then 2 then 1 and no events, chunks are `start`, `data-queue{2}`, `data-queue{1}` (no duplicate for the repeated 2); when the first event appears the next chunk after `data-queue{0}` is that event; without the option no `data-queue` chunk ever appears (existing tests unchanged). parts: schema rejects negative positions.
- [ ] **Step 2: Run** `pnpm --filter @xo/engine test` → FAIL. **Step 3: Implement.** **Step 4: Run** with `TEST_DATABASE_URL` → PASS; typecheck. **Step 5: Commit** `feat(engine): run policy, queue position and transient queue part`

---

### Task 2: Web: demo limits, quota in the messages route, queue on `/run` and in the chat

**Files:**
- Create: `apps/web/src/server/limits.ts` (`getLimits(): { demoMode, paused, maxRunsPerDay, maxRounds }` from env), `apps/web/src/modules/chat/parts/queue-card.tsx` (+test), `apps/web/src/server/limits.test.ts`
- Modify: `apps/web/src/env.schema.ts` (+test), `apps/web/src/server/runs.ts` (`runsStartedSince(userId, since): Promise<{ count: number; oldestQueuedAt: Date | null }>`), `apps/web/src/server/runs.db.test.ts`, `apps/web/src/app/api/chats/[id]/messages/route.ts` (+test; pass `queuePosition: () => runStore.queuePosition(run.id)` to the tail; policy check before `startRun`), `apps/web/src/app/api/chats/[id]/stream/route.ts` (+test; same `queuePosition`), `apps/web/src/app/api/chats/[id]/run/route.ts` (+test; `queuePosition`), `apps/web/src/server/ui-message.ts` (+test; `data-queue`), `apps/web/src/modules/chat/message-parts.tsx` (+test; QueueCard first, timeline hidden while position ≥ 1 and no stage parts), `apps/web/src/modules/chat/chat.tsx` (+test; three notices; `limits` prop), `apps/web/src/modules/chat/composer/run-options.tsx` (+test; `maxRounds` prop filters `ROUND_OPTIONS`, default = `min(DEFAULT_ROUNDS, maxRounds)`), `apps/web/src/modules/chat/composer/composer.tsx` (`maxRounds` passthrough), `apps/web/src/app/(chat)/c/[id]/page.tsx` and `(chat)/page.tsx` (pass `limits` from `getLimits()`; when `paused`, a `role="status"` banner "The demo is paused" above the composer and the composer disabled), `turbo.json` `globalEnv`, `.env.example`

**Interfaces:**
- Consumes: `checkRunPolicy`, `QueueDataSchema`, `RunStore.queuePosition` (Task 1).
- Produces: `Limits = { demoMode: boolean; paused: boolean; maxRunsPerDay: number; maxRounds: number }` passed as a plain prop to `Chat`.

- [ ] **Step 1: Write failing tests** — env: defaults; `DEMO_MAX_ROUNDS=0` rejected. `runsStartedSince` (db): counts only this user's runs with `queued_at >= since` across all statuses, returns the oldest `queued_at`. route: `DEMO_PAUSED=1` → 409 `demo_paused`, `startRun` not called, follow-up path still works (latest `done`), retry route untouched; `DEMO_MODE=1` with 2 runs in window → 429 with `resetAt`; `maxRounds 5` with `DEMO_MAX_ROUNDS=3` → 400 `rounds_exceeded`; `DEMO_MODE=0` → `startRun` called with 40 rounds. `/run`: queued run → `queuePosition: 2` (mock store); running → `null`. ui-message: `data-queue` part accepted. message-parts: `data-queue{2}` and no stage → card "You are #2 in the queue" and no timeline; `data-queue{0}` + stage parts → no card. run-options: `maxRounds=3` → options 1,2,3 only, default 3. chat: `onError('quota_exceeded')` shows the sentence; `limits.paused` renders the banner and disables the composer.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `pnpm --filter web test` (with `TEST_DATABASE_URL`), typecheck, build → PASS. **Step 5: Commit** `feat(web): demo limits, queue position card, pause switch`

---

### Task 3: Health route, migrator, mock host binding

**Files:**
- Create: `apps/web/src/app/api/health/route.ts` (+ `route.test.ts`), `packages/db/src/migrate.ts`
- Modify: `apps/web/src/env.schema.ts` (`HEALTH_CHECK_MIROFISH`), `packages/db/package.json` (`db:migrate:prod`, `tsx` + `postgres` + `drizzle-orm` in `dependencies`), `packages/mirofish/mock/server.ts` (`HOST`), `packages/mirofish/mock/server.test.ts`, `.env.example`, `turbo.json`

**Interfaces:**
- Produces: `GET /api/health` per Global Constraints; `pnpm --filter @xo/db db:migrate:prod` (exit 0 on success, 1 on failure, prints `migrated` / the error name only).

- [ ] **Step 1: Write failing tests** — health: db ok + mirofish ok → 200 body exactly `{ ok:true, db:'ok', mirofish:'ok' }`; mirofish fetch rejects → 503 `{ ok:false, db:'ok', mirofish:'error' }` and the body contains no `http`, no stack (**Review Focus 5**); `HEALTH_CHECK_MIROFISH=0` → `mirofish:'skipped'`, 200; db throws → 503 `db:'error'`. mock: `HOST=0.0.0.0` binds on all interfaces (assert `server.address().address`). migrator: run against the test DB twice → exit 0 both times (idempotent) — a vitest test spawning `tsx src/migrate.ts` with `DATABASE_URL` set.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS. **Step 5: Commit** `feat: health route, production migrator, mock host binding`

---

### Task 4: Web and worker images

**Files:**
- Create: `infra/docker/Dockerfile.web`, `infra/docker/Dockerfile.worker`, `.dockerignore`
- Modify: `apps/web/next.config.ts` (`output: 'standalone'`, `outputFileTracingRoot: findRepoRoot(...)`), `apps/worker/package.json` (`tsx` → dependencies), `apps/web/src/lib/storage.ts` and `apps/worker/src/main.ts` (relative `STORAGE_LOCAL_DIR` stays repo-relative; absolute paths used as-is; no behaviour change for existing tests), `.github/workflows/ci.yml` (`docker` job)

**Interfaces:**
- Produces: image `xo-web` (port 3000, needs `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `MIROFISH_URL`, `MIROFISH_TOKEN`, `STORAGE_*`/`S3_*`, `DEMO_*`), image `xo-worker` (`CMD pnpm --filter worker start`; migrate via `pnpm --filter @xo/db db:migrate:prod`).

- [ ] **Step 1: Build** both images locally: `docker build -f infra/docker/Dockerfile.web --build-arg NEXT_PUBLIC_APP_URL=http://localhost:3000 -t xo-web .` and `docker build -f infra/docker/Dockerfile.worker -t xo-worker .` → exit 0; `docker run --rm xo-worker pnpm --filter @xo/db db:migrate:prod` with a bad `DATABASE_URL` → exit 1 with a one-line error (proves the entrypoint and that `.env` is not baked in: `docker run --rm xo-web ls -a /app | grep -c '^.env$'` → 0) (**Review Focus 4**).
- [ ] **Step 2: Run** `docker run --rm -e DATABASE_URL=... -e BETTER_AUTH_SECRET=... -e BETTER_AUTH_URL=http://localhost:3000 -e MIROFISH_URL=http://localhost:5001 -p 3000:3000 xo-web` against the dev Postgres (host.docker.internal:55432) → `curl localhost:3000/api/health` returns JSON (503 is fine without MiroFish).
- [ ] **Step 3: CI** job added; `pnpm test` unaffected. **Step 4: Commit** `build: web standalone and worker docker images`

---

### Task 5: MiroFish image, token proxy, retention script, `infra/mirofish/README.md`

**Files:**
- Create: `infra/mirofish/Dockerfile` (`python:3.11-slim`, `apt-get install git`, copy `uv` from `ghcr.io/astral-sh/uv:0.9.26`, `git clone --depth 1` at `MIROFISH_REF` then `git checkout` the SHA, `uv sync --frozen` in `backend/`, `ENV FLASK_HOST=0.0.0.0 FLASK_PORT=5001`, `WORKDIR /app/backend`, `CMD ["uv","run","python","run.py"]`, `HEALTHCHECK CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:5001/health')"`), `infra/mirofish/Caddyfile`, `infra/mirofish/retain.sh`, `infra/mirofish/README.md`
- Test: `infra/mirofish/caddyfile.test.sh` (runs `docker run --rm -v $PWD/infra/mirofish/Caddyfile:/etc/caddy/Caddyfile caddy:2 caddy validate --config /etc/caddy/Caddyfile`), and a curl check in Task 7

**Interfaces:**
- Produces: proxy on `:8080` with env `MIROFISH_TOKEN`, `MIROFISH_UPSTREAM`; `README.md` covers the AGPL boundary (HTTP only, unmodified upstream, pinned SHA, how to bump), required MiroFish env, the single-process constraint, the volume, the retention cron line (`0 3 * * * RETAIN_DAYS=7 /opt/xo/retain.sh /var/lib/docker/volumes/.../_data`), and why the token lives in Caddy rather than a fork.

- [ ] **Step 1:** Write the Caddyfile: `:8080 { @health path /health; handle @health { reverse_proxy {$MIROFISH_UPSTREAM} } @bad not header X-MiroFish-Token {$MIROFISH_TOKEN}; handle @bad { respond 401 {"{\"success\":false,\"error\":\"unauthorized\"}"} } handle { reverse_proxy {$MIROFISH_UPSTREAM} { transport http { read_timeout 900s } } } }` (exact syntax left to the implementer; `caddy validate` must pass; long read timeout because ontology calls take minutes).
- [ ] **Step 2:** `docker build -f infra/mirofish/Dockerfile -t xo-mirofish infra/mirofish` → exit 0; `docker run --rm xo-mirofish uv run python -c "import flask, camel"` → exit 0 (dependencies resolve; the server itself cannot start without keys and exits 1 — record that).
- [ ] **Step 3:** `retain.sh` with a temp dir containing an old and a new folder → deletes only the old one (shell test in the script's own `--self-test` flag).
- [ ] **Step 4: Commit** `infra: mirofish image, caddy token proxy, retention script and README`

---

### Task 6: Full compose, `.env.selfhost.example`, `vercel.json`, `docs/hosting.md`, README

**Files:**
- Create: `infra/docker/docker-compose.yml`, `.env.selfhost.example`, `apps/web/vercel.json`, `docs/hosting.md`
- Modify: `README.md` (Quickstart gains "Self-host with Docker" pointing at `docs/hosting.md`; Repository layout updated), `docs/superpowers/plans/2026-10-21-phase-3-followups.md` (tick the globalEnv note)

**Interfaces:**
- Consumes: images from Tasks 4–5, env names from Tasks 2–3.
- Produces: `docker compose -f infra/docker/docker-compose.yml --env-file .env.selfhost --profile mock up --build` boots everything with no keys; `--profile real` uses MiroFish.

- [ ] **Step 1:** `docker compose -f infra/docker/docker-compose.yml --env-file .env.selfhost.example config` → exit 0 for both profiles; `docker compose ... config | grep -c 'published'` → exactly 1 (web) (**Review Focus 3/4**).
- [ ] **Step 2:** `docs/hosting.md` sections: Self-host (compose, profiles, env table, volumes, backups, retention cron, updating MiroFish), Hosted demo topology (Vercel web → Postgres; worker + proxy + MiroFish on the container host; S3/R2; `DEMO_MODE=1`, quotas, `DEMO_PAUSED` kill switch, health monitoring), Vercel notes (Pro plan, `maxDuration`, root directory `apps/web`, build command, env list), Limits and costs (per-run LLM cost caveat from upstream, rounds cap 3).
- [ ] **Step 3: Commit** `docs: self-host compose bundle and hosting guide`

---

### Task 7: Clean-machine verification

- [ ] **Step 1 (mock profile, no keys):** from a fresh clone directory (`git clone <repo> /tmp/xo-clean && cd /tmp/xo-clean`), `cp .env.selfhost.example .env.selfhost`, fill `BETTER_AUTH_SECRET` and `MIROFISH_TOKEN`, `docker compose -f infra/docker/docker-compose.yml --env-file .env.selfhost --profile mock up --build -d`; wait for `curl -s localhost:3000/api/health` → `{"ok":true,...}`; `docker compose ... ps` shows only web with a published port; `docker compose ... exec web sh -c 'wget -qO- http://mirofish-mock:5001/health || echo blocked'` → `blocked` (network isolation) and `wget -qO- http://mirofish-proxy:8080/api/graph/task/x` → 401 (**Review Focus 3**); run a full simulation through the browser (upload, question, 1 round) to Done; a follow-up answers.
- [ ] **Step 2 (queue and quota):** set `DEMO_MODE=1`, recreate web; browser A starts a run; browser B (private window) starts a run → sees "You are #2 in the queue" until A finishes, then its timeline appears; B starts a second run after that → ok; B's third → "You've used today's two runs" (**Review Focus 1/2**). Set `DEMO_PAUSED=1`, recreate web → banner shown, composer disabled, follow-up in a finished chat still works.
- [ ] **Step 3 (real profile boot):** `--profile real up mirofish mirofish-proxy` with placeholder keys → MiroFish exits 1 with its validation message (expected without keys); with real keys if available, `/health` through the proxy returns 200 and one real 1-round run completes (record whether keys were available; if not, record this as unverified in the followups doc).
- [ ] **Step 4:** Screenshot `.context/phase4-queue.jpg` (browser B queued). Gates: `pnpm typecheck`, `pnpm test`, `pnpm --filter web build`, CI green including the docker job. `docker compose down -v`; remove `/tmp/xo-clean`.
- [ ] **Step 5: Commit** any doc corrections: `docs: self-host verification notes`

---

### Task 8: Hosted demo deployment runbook (credential-gated)

**Files:**
- Create: `docs/hosting-runbook.md` (step list with exact CLI commands for Vercel and Railway; alternatives for Fly/VM in one paragraph), `infra/railway/README.md` (service list: `postgres`, `mirofish`, `mirofish-proxy`, `worker`; env per service; volume for MiroFish; private networking; healthcheck paths)

- [ ] **Step 1:** Vercel (authenticated as `jdships`): `vercel link` in `apps/web` to a new project `xenet-opinions`, set env (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`, `MIROFISH_URL`, `MIROFISH_TOKEN`, `STORAGE_DRIVER=s3`, `S3_*`, `DEMO_MODE=1`), root directory `apps/web`, install command `pnpm install --frozen-lockfile` at repo root. Do not deploy to production until the backend exists.
- [ ] **Step 2:** Railway: requires `railway login`; if not authenticated, STOP with status BLOCKED listing exactly what is needed (Railway login, R2/S3 bucket + keys, LLM + Zep keys). Otherwise create the project and services per `infra/railway/README.md`, run `db:migrate:prod` once, point Vercel `MIROFISH_URL` at the proxy's private/public URL, deploy, and verify `/api/health` → 200 and one 1-round run end to end.
- [ ] **Step 3: Commit** `docs: hosted demo runbook`

## Open risks

- The upstream MiroFish image pattern was read from its Dockerfile but not built here; `python:3.11-slim` may need extra apt packages for PyMuPDF or camel-oasis. Task 5 records what was required.
- Real-MiroFish behaviour is still unverified (no keys on this machine); the mock profile proves the stack, not the integration.
- Queue position is a point-in-time count; with `MAX_CONCURRENT_RUNS > 1` the "#N" reads as runs ahead, not wait time. ETA is deferred (no per-run duration data yet).
- `tsx` in production images runs TypeScript directly; a compile step can come later if cold start matters.
- Railway/R2/keys are not available from this session yet; Task 8 is designed to stop cleanly without them.
