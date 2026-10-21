# Xenet Opinions

Xenet Opinions is an open-source, chat-first interface for running MiroFish simulations and reading the resulting opinions. A pipeline timeline in the chat shows each stage of a run as it streams in. Phase 1 connects it to MiroFish through a background worker; a mock MiroFish lets you run the whole pipeline locally.

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

## Running the full pipeline locally

Start the mock MiroFish in one terminal and the web app plus worker in another:

```sh
MOCK_SPEED=5 pnpm mock   # terminal 1, listens on :5001
pnpm dev                 # terminal 2, web on :3000 and the worker
```

Open http://localhost:3000, start a new conversation, attach a `.txt`, `.md` or `.pdf`, ask a question and choose the number of simulation rounds. The chat then shows the run as it happens: the attached sources, a timeline of six running stages plus a final Done row, ontology chips, a graph preview, the persona roster as it fills, the simulation feed round by round, the report workbench steps and finally the report text. Reloading the page shows the same persisted parts. While a run is active the composer is locked and the API answers further messages with 409 `run_active`. Uploads accept `.pdf`, `.md` and `.txt` files, up to 5 files per message and 10 MB each. Follow-up questions in a finished conversation arrive in Phase 3; for now they get 409 `run_finished`.

`MOCK_SPEED` divides the mock's delays (higher is faster), `MOCK_FAIL_STAGE` (`graph_build`, `sim_prepare`, `sim_run` or `report`) makes that stage fail with "Injected failure", `MOCK_TOKEN` requires the token header and `MOCK_LOG=1` prints one line per request.

## Running against a real MiroFish

Set `MIROFISH_URL` in `.env` to your MiroFish backend, and set `MIROFISH_TOKEN` as well if the fork's token middleware is enabled. Zep Cloud and LLM keys belong in MiroFish's own `.env`, not here. A real run takes roughly 20 to 60 minutes depending on agent count and rounds, so keep the worker running for the whole time. Restarting it is safe: it resumes the run from the stored cursors without starting the simulation twice.

## Worker

`apps/worker` claims queued runs from Postgres, drives them through the stages by calling MiroFish, and appends every step to `run_events`, which the web app tails to stream the chat. Tune it with `WORKER_POLL_MS` (queue poll interval, default 2000), `MAX_CONCURRENT_RUNS` (default 1) and `WORKER_ID` (lease owner name, defaults to host and pid). Run it alone with `pnpm --filter worker dev`.

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
- `infra/docker`: Compose file for the local Postgres 18 database.
- `docs/superpowers`: design spec and implementation plans.

## License

This repository is MIT licensed. Third-party components vendored into the web app are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). MiroFish (https://github.com/666ghj/MiroFish) is AGPL-3.0. This UI only talks to MiroFish over HTTP and never imports or vendors its code, so the AGPL does not apply here. Any patches to MiroFish live in a separate AGPL fork.

## Documents

- Design spec: [docs/superpowers/specs/2026-10-19-xenet-opinions-design.md](docs/superpowers/specs/2026-10-19-xenet-opinions-design.md)
- Phase 0 plan: [docs/superpowers/plans/2026-10-19-phase-0-scaffold.md](docs/superpowers/plans/2026-10-19-phase-0-scaffold.md)
