# Contributing

Thanks for helping. Bug reports and feature requests go in GitHub issues; security problems go through [SECURITY.md](SECURITY.md) instead.

## Setup

You need Node 24, pnpm 10.30 (pinned in `package.json` and provided by corepack) and Docker for Postgres.

```sh
corepack enable
pnpm install
cp .env.example .env
sed -i.bak "s|^BETTER_AUTH_SECRET=$|BETTER_AUTH_SECRET=$(openssl rand -base64 32)|" .env && rm .env.bak
docker compose --env-file .env -f infra/docker/docker-compose.dev.yml up -d
pnpm --filter @xo/db db:migrate
```

If `corepack enable` fails with a permission error (Node installed system-wide), run `sudo corepack enable`, or skip it when `pnpm --version` already prints 10.30 or later. Every app and package reads the repo-root `.env`. If port 5432 is already taken, set `XO_PG_PORT` in `.env` and use the same port in `DATABASE_URL` and `TEST_DATABASE_URL` before starting Postgres.

## Running

Run the mock MiroFish and the app in two terminals:

```sh
pnpm mock   # mock MiroFish on :5001
pnpm dev    # web on :3000 and the worker
```

Without `RESEND_API_KEY` the dev server prints magic links to its terminal. In demo mode `MAX_RUNS_PER_DAY` defaults to 3 per signed-in user and `MAX_RUNS_PER_DAY_ANONYMOUS` to 1.

The mock is stateful and needs no keys. Its switches:

- `MOCK_SPEED` divides its delays (higher is faster), for example `MOCK_SPEED=5 pnpm mock`.
- `MOCK_FAIL_STAGE` (`graph_build`, `sim_prepare`, `sim_run` or `report`) makes that stage fail with "Injected failure". `POST /__mock/fail-stage` with `{"stage":"sim_prepare"}` (or `null`) switches it at runtime; a task that already failed stays failed, so clear the flag and press Retry to run the stage against a fresh task.
- `MOCK_TOKEN` requires the `X-MiroFish-Token` header; `MOCK_LOG=1` prints one line per request.

The chat UI uses [ReUI](https://reui.io) primitives installed through the shadcn registry. Adding or updating one needs a ReUI Pro licence key in `apps/web/.env.local` as `REUI_LICENSE_KEY=...` (git-ignored); run `pnpm dlx shadcn@latest add @reui/<name>` from `apps/web`. The key is never needed to build or run the app.

To run against a real MiroFish, point `MIROFISH_URL` at the token proxy and set `MIROFISH_TOKEN` to its token (see [infra/mirofish/README.md](infra/mirofish/README.md)). LLM and Zep keys belong in MiroFish's environment, not in `.env`.

The worker is tuned with `WORKER_POLL_MS` (default 2000), `MAX_CONCURRENT_RUNS` (default 1), `WORKER_ID` (lease owner, default host and pid), `ENV_KEEPALIVE_MS` (how long a finished run stays open for interviews, default 20 minutes) and `ENV_SWEEP_INTERVAL_MS` (default 60000, `0` disables the sweeper). Uploads use `STORAGE_DRIVER=local` under `STORAGE_LOCAL_DIR` by default; `STORAGE_DRIVER=s3` with the `S3_*` variables uses a bucket. `.env.example` lists every variable.

## Checks

Run these before opening a pull request; CI runs them too, plus the web build and the Docker and proxy checks:

```sh
pnpm lint             # Biome: formatting and lint rules
pnpm typecheck
TEST_DATABASE_URL=postgresql://xo:xo@localhost:${XO_PG_PORT:-5432}/xo_test pnpm test   # adjust the port if you changed XO_PG_PORT
pnpm check:licenses   # production dependency licences
pnpm test:scripts     # tests for the repo scripts
```

Tests run in parallel against per-package databases (`xo_test_engine`, `xo_test_worker`, `xo_test_web`, `xo_test_db`) that are created and migrated automatically on the server in `TEST_DATABASE_URL`. Without it the base is derived from `DATABASE_URL` (database `xo_test`); with neither, database tests are skipped. The dev `xo` database is never touched. `pnpm lint:fix` applies Biome's safe fixes and formatting. Changes to the Docker bundle are checked with `bash infra/docker/compose.test.sh`.

## Pull requests

- Keep them small and focused on one change.
- Add or update tests for behaviour you change.
- Run `pnpm lint:fix` before pushing.
- Update the docs (README, `docs/`, `.env.example`) for anything user-facing: behaviour, configuration, commands.
- Describe how you tested it in the pull request template.

## MiroFish and the AGPL

MiroFish is AGPL-3.0 and this repository is MIT. Never import, vendor, copy or patch MiroFish code here, not even small snippets. Talk to it over HTTP only, through `@xo/mirofish`, our independently written client. If MiroFish needs a change, it belongs upstream.

## Where things live

| Path | Contents |
| --- | --- |
| `apps/web` | Next.js app: chat UI, API routes, auth, run streaming |
| `apps/worker` | Background worker that drives runs through MiroFish |
| `packages/engine` | Run state machine, stage handlers, event projector, shared part types |
| `packages/db` | Drizzle schema, migrations and Postgres client |
| `packages/mirofish` | Typed HTTP client for MiroFish, plus the mock server in `mock/` |
| `packages/storage` | Local and S3 upload storage |
| `packages/config` | Shared TypeScript, Vitest and env configuration |
| `infra/docker` | Dockerfiles, the self-host Compose bundle and `up.sh` / `up-mock.sh`, dev Postgres |
| `infra/mirofish` | MiroFish image, Caddy token proxy, retention script |
| `infra/railway` | Hosted demo service layout |
| `scripts` | Licence check |
| `docs` | Hosting guide, runbook, design specs and plans |
