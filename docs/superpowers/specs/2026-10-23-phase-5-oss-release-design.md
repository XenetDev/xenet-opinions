# Xenet Opinions Phase 5: Open-source release — design

Addendum to `docs/superpowers/specs/2026-10-19-xenet-opinions-design.md` (Phase 5) with the decisions taken on 2026-10-23. Inputs: `docs/superpowers/plans/2026-10-22-phase-4-followups.md` (Phase 5 design notes).

## Intent

Make the repository something an outside developer can run, understand and contribute to in their first hour, and something Xenet is comfortable pointing the MiroFish community at. Phases 0–4 built the product; this phase removes friction and sharp edges, and publishes prebuilt images so the self-host path is "install Docker, get two keys, run one command".

## Goals

- A self-hoster with Docker, an OpenAI-compatible LLM key and a Zep Cloud key runs the whole product with one `docker compose` command, pulling prebuilt images instead of building a 4 GB MiroFish image.
- The default self-host experience is the real MiroFish. It refuses to start without keys and the docs say so up front. The mock is a developer switch, never the default.
- Contributor hygiene: CONTRIBUTING, SECURITY, issue and PR templates, a working lint step, CI that runs typecheck + lint + tests + docker build + licence check, and a release workflow that publishes images to GitHub Container Registry on tags.
- README that explains the architecture and the MIT/AGPL boundary in one screen, and a quickstart that is correct from a fresh clone (today it silently needs the mock in a second terminal).
- An accessibility pass over the chat UI with automated checks in the component tests.
- The Phase 4 carry-overs that matter before a public launch: MiroFish container as non-root, MinIO fork pinned by digest, the kill switch also blocking retries, the web image no longer tracing the whole source tree, a loud failure when the MiroFish token is blank.

## Non-goals

- The hosted demo deployment itself (Vercel + Railway). The runbook exists; executing it needs credentials and is a separate session.
- Replacing Zep Cloud or making MiroFish work without it. Upstream mandates Zep; we document it.
- Postgres `LISTEN/NOTIFY` for the stream (spec's optional item). Polling is adequate and already proven.
- A fixture-replay mode distinct from the existing stateful mock. The mock server already serves UI development and CI; "mock mode" in this phase means the existing mock behind an explicit switch.
- Forking MiroFish. Upstream still runs unmodified from a pinned commit behind the Caddy proxy.

## Anti-goals

- A first run that silently uses fake data. If keys are missing, MiroFish must fail to start and the health route and docs must make that obvious.
- Any AGPL code entering this repository.
- Tooling that slows contributors down: no multi-minute lint, no flaky browser suite in CI.

## Decisions

- **Default is the real MiroFish; profiles are replaced by compose files.** Verified 2026-10-23: Compose enforces `${VAR:?}` for every service in the file, including inactive profiles, so required keys cannot live in a profiled service. Instead: `infra/docker/docker-compose.yml` holds every service except MiroFish; `infra/docker/docker-compose.real.yml` adds `mirofish` with `LLM_API_KEY` and `ZEP_API_KEY` as required interpolations (a blank key fails the command with a clear message, no crash loop); `infra/docker/docker-compose.mock.yml` adds `mirofish-mock`. Both overlays set `MIROFISH_UPSTREAM` for the proxy, so that variable leaves the env file. The documented self-host command is `docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.real.yml --env-file .env.selfhost up -d`, wrapped in two one-line scripts `infra/docker/up.sh` and `infra/docker/up-mock.sh` so nobody types the flags. `COMPOSE_PROFILES` disappears from the env example.
- **The web client is same-origin at runtime.** `NEXT_PUBLIC_APP_URL` is baked into the client bundle today, so one prebuilt web image would only work on `localhost:3000`. The Better Auth client drops its explicit `baseURL` (same-origin default) and the app reads `NEXT_PUBLIC_APP_URL` only on the server. The web image then works on any host or port without a rebuild; the Dockerfile keeps a build arg only as a non-functional default and the docs stop telling people to rebuild for a new URL.
- **Image tags.** Release images are tagged `vX.Y.Z`, `vX.Y`, `latest`; `main` publishes `edge`. The compose default is `${XO_IMAGE_TAG:-edge}` on `main`; the release workflow's tag commit sets the default to that version, so a checkout of a tag runs the matching images. The README tells self-hosters to check out the latest tag.
- **Blank `MIROFISH_TOKEN` is loud.** `GET /api/health` additionally probes a token-protected MiroFish route (any cheap `GET` under `/api/`) and reports `mirofish: 'unauthorized'` with 503 when it gets 401, so a missing or mismatched token shows in health instead of only at the first run. The token stays optional in the env schemas so `pnpm dev` against the mock without a token keeps working.
- **Prebuilt images on GHCR.** A `release.yml` workflow builds and pushes `ghcr.io/<owner>/xenet-opinions-web`, `-worker` and `-mirofish` on `v*` tags (and `main` as `edge`), multi-arch (`linux/amd64`, `linux/arm64`) with buildx and GitHub Actions layer cache. The compose files keep `build:` and add `image: ghcr.io/...:${XO_IMAGE_TAG:-edge}` with `pull_policy: missing`, so `up` pulls when the image exists and builds locally otherwise. The `ci.yml` docker job switches to buildx with cache (no push). **Decided by the owner 2026-10-23:** `xenet-opinions-mirofish` is published too. Distributing an AGPL-3.0 binary is permitted with the licence and a source offer, so the image carries OCI labels (`org.opencontainers.image.source` = upstream repo, `org.opencontainers.image.revision` = the pinned commit, `org.opencontainers.image.licenses=AGPL-3.0`), keeps the upstream `LICENSE` at `/app/LICENSE`, and `infra/mirofish/README.md` states that the image is upstream unmodified at that commit and where the source is.
- **Lint = Biome** (one config at the root, formatter plus linter, recommended rules, React/Next domain rules, `useExhaustiveDependencies` on). `pnpm lint` runs `biome ci .`; `pnpm format` runs `biome format --write .`. Existing code is formatted once in its own commit so the diff is reviewable. ESLint is not added (Next 16 dropped `next lint`).
- **Licence check** = a script using `pnpm licenses list --json` against an allowlist (MIT, ISC, BSD-2/3, Apache-2.0, 0BSD, CC0, Unlicense, Python-2.0, MPL-2.0 with note) that fails CI on anything else or on unknown; `license` field added to every `package.json` (`MIT`).
- **Accessibility** = `vitest-axe` in the existing jsdom component tests for every chat part and the sidebar, plus fixes for the known gaps: the running dot in the chat list gets a role and sr-only text; the graph preview gets a text alternative (node/edge counts and a list of the top labels); the simulation feed round counter becomes a polite live region; the report workbench status icons get sr-only labels; hidden file inputs are `disabled` while paused; a single shared `role="status"` region for notices and badge so two regions never coexist. No Playwright in this phase.
- **Kill switch blocks retries.** `POST /run/retry` returns `409 demo_paused` when `DEMO_PAUSED=1`. Quota still exempts retries. Docs updated.
- **Phase 4 carry-overs taken:** MiroFish image runs as a non-root `mirofish` user owning `/app/backend/uploads` (compose volume inherits ownership); `pgsty/minio` and `pgsty/mc` pinned by digest; `turbopackIgnore` on the dynamic path in `packages/storage/src/local.ts` so the web standalone output stops tracing the whole source; `.vercel` and `.env.selfhost` in `.gitignore` (the latter already is); the hosted topology in `docs/hosting.md` gains the container-host env list.
- **Carry-overs explicitly deferred to post-launch:** quota atomicity with `startRun` (exceed-by-one), chat delete closing the env, Railway IPv6 note (document only), queue position with expired leases.
- **README structure:** one-paragraph pitch; an architecture diagram (ASCII, from the spec) with the HTTP-only MiroFish boundary called out; "Run it" with three paths in order of simplicity: self-host with Docker (default, real keys), develop locally (`pnpm dev` + the mock), hosted demo (link to the runbook); licence section; links to docs. Phase numbering disappears from the README.
- **Contributor files:** `CONTRIBUTING.md` (setup, `pnpm test`/`lint`/`typecheck`, the mock, PR expectations, the AGPL rule), `SECURITY.md` (report via GitHub private vulnerability reporting; what is in scope; note that MiroFish error bodies are treated as untrusted and that the proxy token is the only auth to MiroFish), `.github/ISSUE_TEMPLATE/{bug,feature}.yml`, `.github/PULL_REQUEST_TEMPLATE.md`, `CODEOWNERS` (`@jdships`), Dependabot for npm and GitHub Actions weekly.
- **Quickstart budget:** fresh clone to first real run under 10 minutes of human steps, excluding the LLM's own runtime: Docker installed, two keys obtained, four secrets generated by one documented command, one compose command.

## Constraints

- MIT clean-room; nothing from MiroFish or TurboStarter.
- All existing tests keep passing; lint must pass on the whole repo after the one-time format commit.
- GitHub Actions is currently blocked on the account's billing; CI and the release workflow can only be proven once that is resolved. Everything else is verifiable locally (`biome ci`, licence script, `docker compose config`, image builds, `act` is not required).
- The first real-key MiroFish run is still unverified. The owner is supplying an LLM key and a Zep Cloud key in the local, git-ignored `.env.selfhost`; this phase includes one keyed run through the real compose path (health through the proxy, one 1-round run end to end, one follow-up and one interview) and records what the real API returned where the mock had been guessed (interview batch shape, closed-env error, idle-after-start, post storage across restart). Fixtures are captured from that run with `packages/mirofish/scripts/capture-fixtures.ts`.

## Left to the builder

- Exact Biome rule set beyond recommended + React/Next; which rules to disable to keep the one-time format commit mechanical.
- Image naming under the owner's namespace and the tagging scheme details (`vX.Y.Z`, `vX.Y`, `latest`, `edge`).
- The exact text of CONTRIBUTING, SECURITY and the templates.
- How the licence allowlist handles dual-licensed packages.
- Test structure for the axe checks (one shared helper, per-component `it` cases).
