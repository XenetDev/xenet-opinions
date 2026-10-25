# Xenet Opinions Phase 5: Open-source Release — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An outside developer with Docker, an LLM key and a Zep Cloud key runs the real product with one command from prebuilt images, understands the repo from the README, and can contribute against a lint-clean, licence-checked, accessibility-tested codebase; and the real MiroFish integration is verified for the first time.

**Architecture:** Compose profiles become compose files (base + `real` + `mock` overlays) so the real MiroFish service can require its keys. Images are published to GitHub Container Registry by a tag-triggered workflow and referenced from compose with a local-build fallback. The web client becomes same-origin so one web image serves any host. Lint is Biome, licence checking is a pnpm-based allowlist script, accessibility checks are `vitest-axe` inside the existing jsdom component tests. The Phase 4 carry-overs that matter before launch are taken in the same tasks that touch their files.

**Tech Stack:** unchanged app stack; new dev tooling: `@biomejs/biome` 2.x, `vitest-axe` + `axe-core`; GitHub Actions `docker/setup-buildx-action`, `docker/login-action`, `docker/metadata-action`, `docker/build-push-action` with `cache-from/to: type=gha`; Dependabot.

**Spec:** `docs/superpowers/specs/2026-10-23-phase-5-oss-release-design.md` (binding) over `docs/superpowers/specs/2026-10-19-xenet-opinions-design.md` (Phase 5). Inputs: `docs/superpowers/plans/2026-10-22-phase-4-followups.md`.

## Global Constraints

- MIT clean-room; no MiroFish or TurboStarter code. The MiroFish image is upstream unmodified at `7657031ac01184afe2cb220f5ee3545573b5e843`.
- Compose files: `infra/docker/docker-compose.yml` (postgres, minio, minio-init, mirofish-proxy, migrate, worker, web; no MiroFish; no `profiles:` anywhere), `infra/docker/docker-compose.real.yml` (service `mirofish` with `LLM_API_KEY: ${LLM_API_KEY:?set LLM_API_KEY in .env.selfhost}` and `ZEP_API_KEY: ${ZEP_API_KEY:?set ZEP_API_KEY in .env.selfhost}`, `LLM_BASE_URL`, `LLM_MODEL_NAME`; plus `mirofish-proxy.environment.MIROFISH_UPSTREAM: mirofish:5001`), `infra/docker/docker-compose.mock.yml` (service `mirofish-mock` + `mirofish-proxy.environment.MIROFISH_UPSTREAM: mirofish-mock:5001`). Scripts `infra/docker/up.sh` and `infra/docker/up-mock.sh` run `docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.<real|mock>.yml --env-file .env.selfhost "$@"` with `up -d` as the default argument, from the repo root (`cd "$(dirname "$0")/../.."`). `.env.selfhost.example` loses `COMPOSE_PROFILES` and `MIROFISH_UPSTREAM`, keeps `LLM_*`/`ZEP_API_KEY` with the two keys blank and a comment that they are required, and gains `XO_IMAGE_TAG=edge`.
- Images: `ghcr.io/jdships/xenet-opinions-web`, `ghcr.io/jdships/xenet-opinions-worker`, `ghcr.io/jdships/xenet-opinions-mirofish`. Each service that builds has `image: ghcr.io/jdships/xenet-opinions-<name>:${XO_IMAGE_TAG:-edge}` and `pull_policy: missing`. `release.yml` triggers on `push: tags: ['v*']` and `push: branches: [main]`; tags via `docker/metadata-action` (`type=semver,pattern={{version}}`, `type=semver,pattern={{major}}.{{minor}}`, `type=raw,value=latest,enable={{is_default_branch}}` is NOT used; instead `latest` only on semver tags and `edge` on main); platforms `linux/amd64,linux/arm64`; `permissions: packages: write, contents: read`; cache `type=gha`. The MiroFish image carries labels `org.opencontainers.image.source=https://github.com/666ghj/MiroFish`, `org.opencontainers.image.revision=7657031ac01184afe2cb220f5ee3545573b5e843`, `org.opencontainers.image.licenses=AGPL-3.0`, `org.opencontainers.image.description="Upstream MiroFish backend, unmodified, packaged for Xenet Opinions"`, keeps `/app/LICENSE`, and runs as user `mirofish` (uid 10001) owning `/app/backend/uploads`.
- MinIO images pinned by digest: `pgsty/minio@sha256:<digest>` and `pgsty/mc@sha256:<digest>` resolved with `docker manifest inspect` at implementation time and recorded in `docs/hosting.md`.
- Web client same-origin: `apps/web/src/lib/auth-client.ts` creates the client without `baseURL`; no `NEXT_PUBLIC_*` variable is read in client components or client-side modules (`grep -rn NEXT_PUBLIC_ apps/web/src --include=*.tsx --include=*.ts` returns only server-side uses or none). `Dockerfile.web` keeps `ARG NEXT_PUBLIC_APP_URL=http://localhost:3000` as a default (no longer required at build); the build-time placeholder for `NEXT_PUBLIC_APP_URL` remains for `env.ts` parsing on the server.
- Health: `GET /api/health` probes, in addition to `GET ${MIROFISH_URL}/health`, `GET ${MIROFISH_URL}/api/graph/task/health-probe` with the `X-MiroFish-Token` header; 401 → `mirofish: 'unauthorized'` and 503; 404 or 200 → ok (the task id does not exist, so 404 from the backend is the expected authorised answer); timeout/network → `error`. Body stays `{ ok, db, mirofish }`.
- Kill switch: `POST /api/chats/:id/run/retry` returns `409 { error: 'demo_paused' }` when `DEMO_PAUSED='1'`, checked before the run lookup. Cancel is never blocked. Quota still exempts retries.
- Lint: `biome.json` at the root (schema for the installed version), `formatter` on (2-space, single quotes, no semicolons, line width 120 to match the codebase), `linter.rules.recommended: true`, domains `react` and `next` recommended, `correctness.useExhaustiveDependencies: error`; `files.ignore` for `node_modules`, `.next`, `dist`, `drizzle/meta`, `apps/web/src/components/ai-elements/**`, `apps/web/src/components/ui/**` (vendored). Root scripts: `"lint": "biome ci ."`, `"format": "biome format --write ."`, `"lint:fix": "biome check --write ."`. The one-time format commit contains only formatting changes (`pnpm test` identical before and after). `turbo.json` keeps `lint` (root-level, not per package): remove the per-package `lint` turbo task and run Biome once from the root in CI.
- Licence check: `scripts/check-licenses.mjs` runs `pnpm licenses list --json --prod` and fails on any package whose licence is not in `ALLOWED = ['MIT','ISC','BSD-2-Clause','BSD-3-Clause','Apache-2.0','0BSD','CC0-1.0','Unlicense','Python-2.0','MPL-2.0','BlueOak-1.0.0','CC-BY-4.0']` or is unknown; dual licences (`(MIT OR Apache-2.0)`) pass if any alternative is allowed; `scripts/license-allowlist.json` holds per-package exceptions with a reason. Root script `"check:licenses": "node scripts/check-licenses.mjs"`. Every `package.json` gets `"license": "MIT"`.
- Accessibility: `vitest-axe` with `expect.extend(matchers)` in a shared `apps/web/src/test/axe.ts`; `expect(await axe(container)).toHaveNoViolations()` in every chat part test, the composer test, the sidebar chat-list test and the chat test; fixes: chat-list running dot → `<span role="img" aria-label="Run in progress">` plus sr-only text; graph preview → an sr-only paragraph "Graph with N nodes and M edges" and a visually hidden `<ul>` of up to 10 node labels; simulation feed round counter wrapped in `aria-live="polite"`; report workbench status icons `aria-hidden` with sr-only labels (`Running`, `Done`, `Failed`); hidden file inputs `disabled` when the composer is disabled; one `NoticeRegion` component (`role="status"`, always mounted) that renders the latest of notice/badge text so the chat never has two `role="status"` regions.
- CI (`ci.yml`): `check` job adds `pnpm lint` (after typecheck) and `pnpm check:licenses`; `docker` job uses buildx with `cache-from: type=gha`, `cache-to: type=gha,mode=max`, builds web, worker and mirofish (`load: false`, no push). `release.yml` as above. Dependabot (`.github/dependabot.yml`): npm weekly grouped minor/patch, github-actions weekly. Templates: `.github/ISSUE_TEMPLATE/bug_report.yml`, `feature_request.yml`, `config.yml` (blank issues off), `.github/PULL_REQUEST_TEMPLATE.md`, `.github/CODEOWNERS` (`* @jdships`).
- Docs: README structure per the design (pitch, ASCII architecture diagram with the HTTP-only boundary, "Run it" with three paths in order: self-host with Docker, develop locally, hosted demo; licence; links); no phase numbers in README; `CONTRIBUTING.md`, `SECURITY.md` per the design; `docs/hosting.md` updated for the compose files, image tags, digests, container-host env list; `.env.example` gains `WORKER_ID` (commented).
- Real-key run (Task 7) uses the local `.env.selfhost` the owner fills in; keys never appear in commits, reports or logs (redact before writing any report).
- Comments: none unless an invariant; single-line only. All Phase 0–4 tests keep passing.

## Review Focus

1. A self-hoster who forgets a key gets one clear sentence from the compose command, never a crash loop; the mock path needs no keys at all. (Task 1 config tests; Task 8 clean-machine)
2. The prebuilt web image signs in and streams on an origin other than `localhost:3000` without a rebuild. (Task 2 unit test on the auth client config + Task 8 run on port 3110)
3. A mismatched or blank proxy token is visible in `/api/health` as `unauthorized`, not only at the first run. (Task 2 route tests; Task 8 curl)
4. Retry while paused is refused with `demo_paused`; cancel still works. (Task 2 route tests)
5. The format commit changes no behaviour and lint stays green for a contributor who runs `pnpm lint` after `pnpm format`. (Task 3: test counts identical before/after; `biome ci` clean)

---

### Task 1: Compose files, env example, MiroFish image hardening, image references

**Files:**
- Create: `infra/docker/docker-compose.real.yml`, `infra/docker/docker-compose.mock.yml`, `infra/docker/up.sh`, `infra/docker/up-mock.sh`, `infra/docker/compose.test.sh`
- Modify: `infra/docker/docker-compose.yml` (remove `mirofish`, `mirofish-mock`, all `profiles:`; add `image:` + `pull_policy: missing` to `web`, `worker`, `migrate`; pin `pgsty/*` by digest), `.env.selfhost.example`, `infra/mirofish/Dockerfile` (non-root user, OCI labels, keep `LICENSE`), `infra/mirofish/README.md` (source offer sentence, non-root note), `.gitignore` (`.vercel`), `docs/hosting.md` (commands, compose files, digests)

**Interfaces:**
- Produces: `infra/docker/up.sh [compose args]`, `infra/docker/up-mock.sh [compose args]`; image names and `XO_IMAGE_TAG` as in Global Constraints; `compose.test.sh` (used by CI later).

- [ ] **Step 1: Write `compose.test.sh`** (fails before the change): with a temp env file holding the four secrets and NO keys: `up-mock.sh config` exits 0; `up.sh config` exits 1 and stderr contains `set LLM_API_KEY in .env.selfhost`; with keys set, `up.sh config` exits 0, `config | grep -c published` = 1, and `config` shows `mirofish-proxy` `MIROFISH_UPSTREAM=mirofish:5001` (real) / `mirofish-mock:5001` (mock); `config` for both contains `pull_policy: missing` three times and no `profiles` key; `mirofish` has no `ports`.
- [ ] **Step 2: Run** `bash infra/docker/compose.test.sh` → FAIL. **Step 3: Implement.** Resolve digests: `docker manifest inspect pgsty/minio:RELEASE.2026-08-04T00-00-00Z` (record the digest). MiroFish Dockerfile: `RUN useradd -u 10001 -m mirofish && chown -R mirofish:mirofish /app/backend/uploads` before `USER mirofish`; labels; `LICENSE` copied to `/app/LICENSE`. **Step 4: Run** the script → PASS; `docker build -f infra/mirofish/Dockerfile -t xo-mirofish infra/mirofish` → exit 0; `docker run --rm xo-mirofish id -u` → `10001`; `docker run --rm xo-mirofish cat /app/LICENSE | head -1` → AGPL header. **Step 5: Commit** `infra: compose overlays for real and mock MiroFish, GHCR image refs, non-root MiroFish`

---

### Task 2: Same-origin web client, health token probe, retry kill switch, paused file inputs, turbopackIgnore

**Files:**
- Modify: `apps/web/src/lib/auth-client.ts` (+ `auth-client.test.ts`: the created client has no `baseURL` option / `process.env.NEXT_PUBLIC_APP_URL` is not referenced in the module — assert via reading the source in the test or by mocking `better-auth/react` `createAuthClient` and checking its argument), `apps/web/src/app/api/health/route.ts` (+test), `apps/web/src/app/api/chats/[id]/run/retry/route.ts` (+test), `apps/web/src/modules/chat/composer/composer.tsx` (+test: file inputs `disabled` when `disabled`), `packages/storage/src/local.ts` (`turbopackIgnore` comment on the dynamic `resolve` usage is NOT a code comment exception: use the documented `/* turbopackIgnore: true */` magic comment only if required by Turbopack — this is an unavoidable API contract; otherwise restructure so the path is computed outside the traced expression), `infra/docker/Dockerfile.web` (build arg default), `docs/hosting.md` (remove "rebuild for a new URL")
- Test: as listed

**Interfaces:**
- Produces: health `mirofish: 'unauthorized'`; retry `409 demo_paused`.

- [ ] **Step 1: Write failing tests** — health: token probe 401 → 503 `{ ok:false, db:'ok', mirofish:'unauthorized' }`; 404 from the probe with `/health` 200 → 200 ok; both probes share the memo (one call each within 5 s). retry: `DEMO_PAUSED=1` → 409 `demo_paused` and `retryRun` not called; `DEMO_PAUSED=0` unchanged. composer: `disabled` → both hidden `<input type="file">` have `disabled`. auth-client: `createAuthClient` called without `baseURL` (**Review Focus 2**).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `pnpm --filter web test`, typecheck, `pnpm --filter web build` (confirm the Turbopack storage warning is gone and `.next/standalone` no longer contains `apps/web/src`) → PASS. **Step 5: Commit** `fix(web): same-origin auth client, health token probe, pause blocks retry, disabled file inputs; storage trace`

---

### Task 3: Biome lint + one-time format, licence check, package licence fields

**Files:**
- Create: `biome.json`, `scripts/check-licenses.mjs`, `scripts/license-allowlist.json`, `scripts/check-licenses.test.mjs` (node:test, pure function over a fixture JSON)
- Modify: root `package.json` (scripts, devDeps `@biomejs/biome`, `license`), every workspace `package.json` (`license: MIT`), `turbo.json` (drop `lint` task), `.github/workflows/ci.yml` (`pnpm lint`, `pnpm check:licenses`)

**Interfaces:**
- Produces: `pnpm lint`, `pnpm format`, `pnpm lint:fix`, `pnpm check:licenses`; `checkLicenses(packages, allowlist) → { ok: boolean; violations: Array<{ name; version; license }> }` exported from the script for the test.

- [ ] **Step 1: Baseline** `pnpm test` counts recorded. **Step 2: Add Biome config and scripts**, run `pnpm format` → commit `style: apply biome format` (formatting only; `pnpm test` counts identical — **Review Focus 5**). **Step 3:** `pnpm lint` → fix remaining lint errors in a separate commit (`chore: lint fixes`), each a behaviour-preserving change; if a rule needs disabling repo-wide, note it in `biome.json` and in the report. **Step 4: Licence script** with its test (allowed, dual, unknown, exception), run `pnpm check:licenses` → PASS or add justified exceptions. **Step 5:** CI steps added; commit `build: biome lint, licence check, licence fields`

---

### Task 4: Release workflow, CI buildx cache, Dependabot, contributor templates

**Files:**
- Create: `.github/workflows/release.yml`, `.github/dependabot.yml`, `.github/ISSUE_TEMPLATE/bug_report.yml`, `.github/ISSUE_TEMPLATE/feature_request.yml`, `.github/ISSUE_TEMPLATE/config.yml`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/CODEOWNERS`
- Modify: `.github/workflows/ci.yml` (docker job → buildx + gha cache, builds all three images, `compose.test.sh` step)

- [ ] **Step 1:** Write `release.yml` per Global Constraints (three `build-push-action` steps or a matrix over `{web, worker, mirofish}` with per-image context/dockerfile). Validate YAML with `actionlint` if available (`brew install actionlint` or `npx -y actionlint`), else `python3 -c "import yaml,sys; yaml.safe_load(open(sys.argv[1]))" .github/workflows/release.yml`. **Step 2:** `ci.yml` docker job updated; `actionlint` clean. **Step 3:** Dependabot, templates, CODEOWNERS. **Step 4: Commit** `ci: GHCR release workflow, buildx cache, dependabot, contributor templates`. Note: the workflows cannot run until the account's Actions billing is fixed; record that in the report.

---

### Task 5: Accessibility pass with axe checks

**Files:**
- Create: `apps/web/src/test/axe.ts`, `apps/web/src/modules/chat/notice-region.tsx` (+test)
- Modify: `apps/web/package.json` (devDeps `vitest-axe`, `axe-core`), `apps/web/vitest.config.ts` (setupFiles), tests for every component under `apps/web/src/modules/chat/parts/*`, `composer.tsx`, `chat.tsx`, `sidebar/chat-list.tsx`; components: `sidebar/chat-item.tsx`, `parts/graph-preview.tsx`, `parts/simulation-feed.tsx`, `parts/report-workbench.tsx`, `chat.tsx` + `env-badge.tsx` (use `NoticeRegion`)

- [ ] **Step 1:** Add the axe helper and an `it('has no axe violations')` to each listed test file rendering a realistic fixture → run → record which FAIL (expected: chat-list dot, graph preview, workbench icons at least). **Step 2:** Implement the fixes from Global Constraints. **Step 3:** All axe tests PASS; existing tests pass; `chat.test.tsx` asserts exactly one `role="status"` element with a notice and an open badge rendered together. **Step 4: Commit** `a11y: axe checks and fixes across chat and sidebar`

---

### Task 6: README, CONTRIBUTING, SECURITY, docs sweep

**Files:**
- Create: `CONTRIBUTING.md`, `SECURITY.md`
- Modify: `README.md` (rewrite per design), `docs/hosting.md` (container-host env list; Vercel Hobby wording re-checked against current Vercel docs via WebFetch and stated accurately), `docs/hosting-runbook.md` (image names, `up.sh`), `infra/mirofish/README.md`, `.env.example` (`# WORKER_ID=`), `docs/superpowers/plans/2026-10-22-phase-4-followups.md` (tick the items this phase resolves)

- [ ] **Step 1:** Draft README with the ASCII architecture diagram from the spec (browser → web → Postgres ← worker → proxy → MiroFish; uploads via S3/MinIO) and the three run paths; every command in it is executed once by the implementer from a scratch directory to confirm it works as written (mock path, since keys may not be present). **Step 2:** CONTRIBUTING (setup, `pnpm dev` + `pnpm mock`, `pnpm test|lint|typecheck`, PR expectations, no AGPL code), SECURITY (private vulnerability reporting link `https://github.com/jdships/xenet-opinions/security/advisories/new`, scope, the proxy token is the only auth to MiroFish, MiroFish error bodies untrusted, no bounty). **Step 3:** `grep -rn "Phase [0-9]" README.md` → none. **Step 4: Commit** `docs: README for release, CONTRIBUTING, SECURITY, hosting sweep`

---

### Task 7: First real-MiroFish run and fixture capture

**Precondition:** `.env.selfhost` at the repo root has non-empty `LLM_API_KEY` and `ZEP_API_KEY` (owner-supplied). If blank, STOP with `BLOCKED` naming the two variables; do not guess.

- [ ] **Step 1:** `bash infra/docker/up.sh up -d --build` (uses the real overlay); wait for `curl -s localhost:3000/api/health` → `{"ok":true,"db":"ok","mirofish":"ok"}` (record MiroFish cold-start time from `docker compose logs mirofish`). **Step 2:** In the browser (or curl), upload one short `.txt`, ask a question, 1 round → run reaches Done; record wall time per stage; then one report follow-up and one 2-persona interview. **Step 3:** Record the real API shapes where the mock guessed: interview batch response, closed-env error after sweeper (`UPDATE runs SET env_keepalive_until = now() - interval '1 minute'`), idle-after-start behaviour, posts across a MiroFish restart (optional). Run `pnpm --filter @xo/mirofish capture-fixtures` (check the script's env/args) against the live instance to refresh `packages/mirofish/src/fixtures/*` including a real `simulation.interview-batch.json`; if `interviewsToParts` or the mock need changes to match reality, make them with tests. **Step 4:** Redact keys; write findings to `docs/superpowers/plans/2026-10-23-phase-5-followups.md` under "Real MiroFish findings". `bash infra/docker/up.sh down -v`. **Step 5: Commit** `test(mirofish): fixtures captured from a real run; integration findings`

---

### Task 8: Clean-machine verification, gates, follow-ups

- [ ] **Step 1 (fresh clone, real keys if present, else mock):** `git clone --branch jdships/phase-5-oss <repo> /tmp/xo-clean`; follow README "Self-host with Docker" literally, timing the human steps (target under 10 minutes excluding image pull/build and LLM runtime); `XO_WEB_PORT=3110` and `NEXT_PUBLIC_APP_URL`/`BETTER_AUTH_URL=http://localhost:3110`; sign-in and a run must work on 3110 with the image built with the default build arg (**Review Focus 2**). **Step 2:** blank-key failure message (**Review Focus 1**); `/api/health` with a wrong `MIROFISH_TOKEN` on `web` → `unauthorized` (**Review Focus 3**); retry while paused → 409 (**Review Focus 4**). **Step 3 gates:** `pnpm lint`, `pnpm check:licenses`, `pnpm typecheck`, `pnpm test`, `pnpm --filter web build`, `bash infra/docker/compose.test.sh`, `bash infra/mirofish/caddyfile.test.sh`; CI and release workflow if Actions billing is fixed (else record). **Step 4:** Screenshot `.context/phase5-readme-run.jpg`; `docs/superpowers/plans/2026-10-23-phase-5-followups.md` deferred section; cleanup. **Step 5: Commit** `docs: phase 5 verification notes`

## Open risks

- GitHub Actions billing: CI, the release workflow and GHCR publishing cannot be proven until the owner resolves it; the first `v0.1.0` tag should be pushed only after a green run on main.
- Biome's one-time format touches most files; reviewers must trust the test-count equality rather than read the diff.
- The real-key run may reveal mock/real mismatches that need code changes beyond `interviewsToParts`; Task 7 is allowed to make tested changes but must report scope creep.
- Multi-arch MiroFish builds on GitHub runners are slow (psutil compiles from source on arm64); the release job may need a 60-minute timeout.
