# Xenet Opinions

Xenet Opinions is an open-source, chat-first interface for running MiroFish simulations and reading the resulting opinions. A pipeline timeline in the chat shows each stage of a run as it streams in. Phase 1 connects it to MiroFish through a background worker, Phase 2 adds resume, cancel, retry and conversation history, and Phase 3 adds follow-up questions to the report agent and interviews with individual personas; a mock MiroFish lets you run the whole pipeline locally.

## Quickstart

Requires Node 24, pnpm 10 and Docker.

```sh
cp .env.example .env
openssl rand -base64 32   # paste into BETTER_AUTH_SECRET in .env
docker compose --env-file .env -f infra/docker/docker-compose.dev.yml up -d
pnpm install
pnpm --filter @xo/db db:migrate
pnpm dev
```

Env is read from the repo-root `.env`.

Then open http://localhost:3000.

If port 5432 is already taken, set `XO_PG_PORT` in `.env` and use the same port in `DATABASE_URL` before starting the database. Start it with the `--env-file .env` command above so Compose reads the override.

Other commands: `pnpm typecheck`, `pnpm test`, `pnpm build`.

Tests run in parallel against per-package databases (`xo_test_engine`, `xo_test_worker`, `xo_test_web`, `xo_test_db`) created and migrated automatically on the same server. Set `TEST_DATABASE_URL` (for example `postgresql://xo:xo@localhost:5432/xo_test`) to choose the server and base name; without it the base is derived from `DATABASE_URL` (database name `xo_test`). If neither is set, database tests are skipped. Test databases are never the dev `xo` database.

### Self-host with Docker

The Compose bundle runs web, worker, Postgres, MinIO and MiroFish (or the mock) behind a token proxy, publishing only the web port. Copy the example, fill in the blank secrets (the file says how to generate each), and start it:

```sh
cp .env.selfhost.example .env.selfhost
docker compose -f infra/docker/docker-compose.yml --env-file .env.selfhost up -d --build
```

See [docs/hosting.md](docs/hosting.md) for profiles, environment, volumes, backups and the hosted demo setup.

## Running the full pipeline locally

Start the mock MiroFish in one terminal and the web app plus worker in another:

```sh
MOCK_SPEED=5 pnpm mock   # terminal 1, listens on :5001
pnpm dev                 # terminal 2, web on :3000 and the worker
```

Open http://localhost:3000, start a new conversation, attach a `.txt`, `.md` or `.pdf`, ask a question and choose the number of simulation rounds. The chat then shows the run as it happens: the attached sources, a timeline of six running stages plus a final Done row, ontology chips, a graph preview, the persona roster as it fills, the simulation feed round by round, the report workbench steps and finally the report text. Reloading the page, switching tabs or hitting the stream cap is harmless: the page reattaches to the run and catches up from the stored events. The Stop button cancels an active run and the timeline shows the stage it stopped at as Cancelled, a failed run can be retried from its failed stage with the button on the timeline, and the sidebar lists your conversations and lets you rename or delete them. While a run is active the composer is locked and the API answers further messages with 409 `run_active`. Uploads accept `.pdf`, `.md` and `.txt` files, up to 5 files per message and 10 MB each.

Once a run is done the composer unlocks for follow-ups. The target selector next to it chooses between **Ask the report**, which sends the question and the recent conversation to MiroFish's report agent and streams its reply, and **Interview personas**, which asks the same question to up to five personas picked from the roster cards (the picks show as removable chips in the composer) and shows one answer card per persona. Interviews need the simulation environment to still be open: the worker keeps it alive for 20 minutes after the run finishes, each interview extends that by 10 minutes (capped at one hour after the run finished), and a badge above the composer shows the time left. When the keepalive expires the worker's sweeper stops the simulation and closes the environment; the badge then reads "Agents offline", the interview option is disabled and the API answers interview requests with 409 `env_closed`, while questions to the report keep working. A follow-up that MiroFish fails to answer ends the stream with a `follow_up_failed` error and leaves no empty reply in the conversation. Interview answers are also stored in the `interviews` table.

`MOCK_SPEED` divides the mock's delays (higher is faster), `MOCK_FAIL_STAGE` (`graph_build`, `sim_prepare`, `sim_run` or `report`) makes that stage fail with "Injected failure", `MOCK_TOKEN` requires the token header and `MOCK_LOG=1` prints one line per request. `POST /__mock/fail-stage` with `{"stage":"sim_prepare"}` (or `null`) switches the injected failure at runtime; a task that already failed stays failed, so clearing the flag and pressing Retry runs the stage again against a fresh task.

## Running against a real MiroFish

Set `MIROFISH_URL` in `.env` to your MiroFish backend. Upstream MiroFish runs unmodified from a pinned commit; the token is enforced by the Caddy proxy in `infra/mirofish/`, so when you go through that proxy point `MIROFISH_URL` at it and set `MIROFISH_TOKEN` to the proxy's token (see [infra/mirofish/README.md](infra/mirofish/README.md)). Zep Cloud and LLM keys belong in MiroFish's own environment, not here. A real run takes roughly 20 to 60 minutes depending on agent count and rounds, so keep the worker running for the whole time. The page reattaches automatically if you reload, switch tabs or outlast the 280 s stream cap, so you can close it and come back. Restarting the worker is safe: it resumes the run from the stored cursors without starting the simulation twice. A graceful shutdown (SIGTERM) releases the run's lease after the current step; only a worker killed without SIGTERM leaves a lease that the next worker waits about 60 s to reclaim.

## Worker

`apps/worker` claims queued runs from Postgres, drives them through the stages by calling MiroFish, and appends every step to `run_events`, which the web app tails to stream the chat. Tune it with `WORKER_POLL_MS` (queue poll interval, default 2000), `MAX_CONCURRENT_RUNS` (default 1), `WORKER_ID` (lease owner name, defaults to host and pid), `ENV_KEEPALIVE_MS` (how long a finished run's simulation environment stays open for interviews, default 1200000, that is 20 minutes) and `ENV_SWEEP_INTERVAL_MS` (how often the sweeper closes expired environments, default 60000; `0` disables the sweeper). Run it alone with `pnpm --filter worker dev`.

## Storage

Uploaded files go through `@xo/storage`. `STORAGE_DRIVER=local` is the default and writes under `STORAGE_LOCAL_DIR` (`.data/uploads`, relative to the repo root). For S3 or compatible stores set `STORAGE_DRIVER=s3` with `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` and optionally `S3_ENDPOINT` and `S3_FORCE_PATH_STYLE=true`. The web app and worker must share the same storage.

## Repository layout

- `apps/web`: Next.js 16 app with anonymous Better Auth sessions, the chat page and the pipeline parts.
- `apps/worker`: background worker that drives runs against MiroFish.
- `packages/config`: shared TypeScript and Vitest base configuration.
- `packages/db`: Drizzle schema, migrations and Postgres client.
- `packages/mirofish`: typed HTTP client for the MiroFish API, plus `mock/`, a local mock server.
- `packages/storage`: local and S3 file storage for uploads.
- `packages/engine`: run state machine, stage handlers, event projector and shared part types.
- `infra/docker`: web and worker Dockerfiles, the self-host Compose bundle (`docker-compose.yml`) and the dev Postgres 18 Compose file (`docker-compose.dev.yml`).
- `infra/mirofish`: MiroFish backend image, Caddy token proxy and uploads retention script.
- `docs/hosting.md`: self-host and hosted demo guide.
- `docs/superpowers`: design spec and implementation plans.

## License

This repository is MIT licensed. Third-party components vendored into the web app are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). MiroFish (https://github.com/666ghj/MiroFish) is AGPL-3.0. This UI only talks to MiroFish over HTTP and never imports or vendors its code, so the AGPL does not apply here. Upstream MiroFish runs unmodified from a pinned commit (see [infra/mirofish/README.md](infra/mirofish/README.md)); a separate AGPL fork remains an option for future patches, not a requirement.

## Documents

- Design spec: [docs/superpowers/specs/2026-10-19-xenet-opinions-design.md](docs/superpowers/specs/2026-10-19-xenet-opinions-design.md)
- Phase 0 plan: [docs/superpowers/plans/2026-10-19-phase-0-scaffold.md](docs/superpowers/plans/2026-10-19-phase-0-scaffold.md)
