# Hosting

Two supported shapes: a single-host Docker Compose bundle for self-hosting, and the hosted demo (web on Vercel, everything else on a container host). The MiroFish image, token proxy and retention script are described in [infra/mirofish/README.md](../infra/mirofish/README.md).

## Self-host

Requires Docker with Compose v2.20 or later. From the repo root:

```sh
cp .env.selfhost.example .env.selfhost   # then fill in the four required secrets
docker compose -f infra/docker/docker-compose.yml --env-file .env.selfhost up -d --build
```

`BETTER_AUTH_SECRET`, `MIROFISH_TOKEN`, `POSTGRES_PASSWORD` and `MINIO_ROOT_PASSWORD` must be filled in first; until they are, every compose command (including `config`) stops with `set <NAME> in .env.selfhost`.

Open http://localhost:3000 (or `XO_WEB_PORT`). `docker compose -f infra/docker/docker-compose.yml --env-file .env.selfhost ps` shows the services; `web` turns healthy once `/api/health` answers 200.

### Services

| Service | Image | Notes |
| --- | --- | --- |
| `postgres` | `postgres:18` | Healthcheck `pg_isready` |
| `minio` | `pgsty/minio` | S3-compatible upload store; console not published |
| `minio-init` | `pgsty/mc` | One-shot, creates the `xo-uploads` bucket |
| `migrate` | `xo-worker` | One-shot `pnpm --filter @xo/db db:migrate:prod` once Postgres is healthy |
| `worker` | `xo-worker` | Starts after `migrate` succeeds |
| `web` | `xo-web` | Starts after `migrate` and `minio-init` succeed; the only published port |
| `mirofish-proxy` | `caddy:2` | Token proxy in front of MiroFish (`infra/mirofish/Caddyfile`) |
| `mirofish` | `xo-mirofish` | Profile `real`; upstream MiroFish backend |
| `mirofish-mock` | `xo-worker` | Profile `mock`; the bundled mock MiroFish |

The official `minio/minio` and `minio/mc` images are no longer published on Docker Hub, so the bundle uses `pgsty/minio` and `pgsty/mc`, a community-maintained fork with the same CLI, pinned by release tag.

Networks: `web` sits on `edge` and `internal`; `worker`, `postgres`, `minio` and the one-shots on `internal`; `mirofish` and `mirofish-mock` on `backend` only. `mirofish-proxy` is the one service on both `internal` and `backend`, so web and worker reach MiroFish only through `http://mirofish-proxy:8080` with the token, and `web` cannot even resolve `mirofish`. No network is marked `internal: true` because MiroFish needs outbound internet for the LLM and Zep.

### Profiles

The active profile comes from `COMPOSE_PROFILES` in `.env.selfhost` (or `--profile` on the command line, which takes precedence). Set `MIROFISH_UPSTREAM` to match.

- `mock` (default): no keys needed. `COMPOSE_PROFILES=mock`, `MIROFISH_UPSTREAM=mirofish-mock:5001`. Runs finish in under a minute. `MOCK_SPEED` divides the mock's simulated stage delays (about 16 s plus 1 s per round at `1`); end-to-end time is dominated by the worker's 2 s poll interval, so values above about 5 make little difference. The mock keeps its simulations in memory, so restarting or recreating `mirofish-mock` makes follow-ups on earlier runs fail.
- `real`: upstream MiroFish; follow the checklist below. The first build of the MiroFish image takes several minutes and produces about 3.9 GB. A real run takes roughly 20 to 60 minutes. Without `LLM_API_KEY` and `ZEP_API_KEY` the `mirofish` container exits 1 with `配置错误` (configuration error) and restarts in a loop.

**Switching to real MiroFish.** `--profile real` alone is not enough: the proxy still points at `MIROFISH_UPSTREAM`, so with the mock value it forwards to a service that is not running and health reports `"mirofish":"error"`.

1. `docker compose -f infra/docker/docker-compose.yml --env-file .env.selfhost down` (no `-v`) while the mock profile is still set, so the mock container stops.
2. In `.env.selfhost` set, together: `COMPOSE_PROFILES=real` and `MIROFISH_UPSTREAM=mirofish:5001`.
3. Set `LLM_API_KEY` and `ZEP_API_KEY` (and optionally `LLM_BASE_URL`, `LLM_MODEL_NAME`).
4. `docker compose -f infra/docker/docker-compose.yml --env-file .env.selfhost up -d --build`.

Switching back is the same with `mock` and `mirofish-mock:5001`.

### Environment

All values live in `.env.selfhost` (see `.env.selfhost.example`). Compose derives `DATABASE_URL=postgresql://xo:${POSTGRES_PASSWORD}@postgres:5432/xo` and the S3 settings itself, so the Postgres password and MinIO credentials are each set in exactly one place.

| Variable | Default | Notes |
| --- | --- | --- |
| `COMPOSE_PROFILES` | `mock` | `mock` or `real` |
| `MIROFISH_UPSTREAM` | `mirofish-mock:5001` | `mirofish:5001` for the real profile |
| `XO_WEB_PORT` | `3000` | Host port for `web` |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | Public URL; baked into the web image at build time, so rebuild after changing it |
| `BETTER_AUTH_URL` | `http://localhost:3000` | Same as the public URL |
| `BETTER_AUTH_SECRET` | blank | Required. `openssl rand -base64 32` |
| `MIROFISH_TOKEN` | blank | Required. `openssl rand -hex 32`; shared by the proxy, web and worker |
| `POSTGRES_PASSWORD` | blank | Required. `openssl rand -hex 32`; must be URL-safe because it goes into `DATABASE_URL` |
| `MINIO_ROOT_USER` | `xo-admin` | At least 3 characters. Also the S3 access key |
| `MINIO_ROOT_PASSWORD` | blank | Required. `openssl rand -hex 24` (MinIO needs at least 8 characters). Also the S3 secret key |
| `LLM_API_KEY` | blank | Real profile. Any OpenAI-compatible key |
| `LLM_BASE_URL` | `https://api.openai.com/v1` | Real profile |
| `LLM_MODEL_NAME` | `gpt-4o-mini` | Real profile |
| `ZEP_API_KEY` | blank | Real profile. Zep Cloud key |
| `MOCK_SPEED` | `5` | Mock profile |
| `DEMO_MODE` | `0` | `1` enables per-user quotas and the rounds cap |
| `DEMO_PAUSED` | `0` | `1` refuses new runs (follow-ups still work) |
| `MAX_RUNS_PER_DAY` | `2` | New runs per anonymous user per 24 h; retries of a failed run are free. Demo mode only |
| `DEMO_MAX_ROUNDS` | `3` | Rounds cap, demo mode only |
| `ENV_KEEPALIVE_MS` | `1200000` | How long a finished run's simulation stays open for interviews |
| `ENV_SWEEP_INTERVAL_MS` | `60000` | Sweeper interval; `0` disables it |

### Demo mode and pause

`DEMO_MODE` and `DEMO_PAUSED` are read by `web` at startup. After editing them in `.env.selfhost`, recreate only `web`:

```sh
docker compose -f infra/docker/docker-compose.yml --env-file .env.selfhost up -d web
```

With `DEMO_PAUSED=1` new runs are refused (`demo_paused`) and the composer is disabled in new chats; follow-ups in finished chats keep working. Other variables follow the same pattern: recreate the service that reads them (`up -d web` after changing `BETTER_AUTH_URL`; `MOCK_SPEED` is read by `mirofish-mock`). `NEXT_PUBLIC_APP_URL` is baked into the image, so rebuild `web` after changing it:

```sh
docker compose -f infra/docker/docker-compose.yml --env-file .env.selfhost up -d --build web
```

### Volumes

Compose names them with the project prefix `xenet-opinions_`.

| Volume | Mounted at | Contents |
| --- | --- | --- |
| `postgres-data` | `/var/lib/postgresql` | Users, chats, runs, run events, interviews |
| `minio-data` | `/data` | Uploaded source files |
| `mirofish-uploads` | `/app/backend/uploads` | MiroFish per-run projects, simulations and reports (real profile) |

`docker compose ... down` keeps the volumes; `down -v` deletes them.

### Backups

Postgres holds everything the UI shows; back it up regularly:

```sh
docker compose -f infra/docker/docker-compose.yml --env-file .env.selfhost exec -T postgres pg_dump -U xo -Fc xo > xo-$(date +%F).dump
docker compose -f infra/docker/docker-compose.yml --env-file .env.selfhost exec -T postgres pg_restore -U xo -d xo --clean < xo-2026-10-22.dump
```

Back up uploads by archiving the `minio-data` volume while `minio` is stopped (or with any S3 tool against the bucket). `mirofish-uploads` is working state for MiroFish and is pruned by the retention job; back it up only if you need to reopen old simulations.

### Retention

MiroFish never deletes its per-run folders. On a Linux host, run `infra/mirofish/retain.sh` from the host crontab against the volume's data directory:

```cron
0 3 * * * RETAIN_DAYS=7 /opt/xo/retain.sh /var/lib/docker/volumes/xenet-opinions_mirofish-uploads/_data
```

`docker volume inspect xenet-opinions_mirofish-uploads --format '{{ .Mountpoint }}'` prints the path. See [infra/mirofish/README.md](../infra/mirofish/README.md#retention) for the rules and limitations.

### Updating MiroFish

The upstream version is pinned by `ARG MIROFISH_REF` in `infra/mirofish/Dockerfile`. Follow [Bumping `MIROFISH_REF`](../infra/mirofish/README.md#bumping-mirofish_ref), then rebuild and restart only MiroFish:

```sh
docker compose -f infra/docker/docker-compose.yml --env-file .env.selfhost --profile real up -d --build mirofish
```

MiroFish keeps task state in memory, so any in-flight run is lost on restart; update between runs.

## Hosted demo topology

```
browser ──► Vercel (apps/web) ──► managed Postgres ◄── worker ─┐
                 │                                             │ private network
                 └── HTTPS (TLS at the host) + token ──► mirofish-proxy
                                                               │
                                          mirofish (single replica, uploads volume)
web + worker ──► S3-compatible bucket (R2 or S3)
```

- Web: Vercel, root directory `apps/web` (see below).
- Postgres: managed Postgres reachable from Vercel and the container host. Run `pnpm --filter @xo/db db:migrate:prod` with its `DATABASE_URL` before each deploy that adds migrations.
- Container host: `worker`, `mirofish-proxy` and `mirofish` on one private network, built from the same Dockerfiles as the bundle. Exactly one MiroFish replica with a persistent volume on `/app/backend/uploads` and the retention cron. MiroFish's port is never public. The proxy is the only public entry point, because Vercel needs to reach it; it requires `X-MiroFish-Token` on everything but `GET /health`. The Caddyfile serves plain HTTP on `:8080` (`auto_https off`), so the container host or platform must terminate TLS in front of it: Railway and Fly do this on their public URLs, a bare VM needs a TLS-terminating reverse proxy. Without TLS the token travels in cleartext.
- Uploads: an S3-compatible bucket (`STORAGE_DRIVER=s3`, `S3_*`) shared by web and worker. For R2 set `S3_ENDPOINT` to the account endpoint, `S3_REGION=auto` and `S3_FORCE_PATH_STYLE=true`.
- Policy: `DEMO_MODE=1` enables the per-anonymous-user quota (`MAX_RUNS_PER_DAY=2` runs per rolling 24 h) and the rounds cap (`DEMO_MAX_ROUNDS=3`). Runs queue FIFO with one at a time (`MAX_CONCURRENT_RUNS=1`) and the chat shows the queue position.
- Kill switch: set `DEMO_PAUSED=1` on Vercel and redeploy (or promote) to refuse new runs with `demo_paused`; follow-ups on finished runs keep working. Set it back to `0` to resume.
- Monitoring: poll `GET /api/health` on the public URL. It returns 200 with `{"ok":true,"db":"ok","mirofish":"ok"}` and 503 when Postgres or the proxy (and through it MiroFish) is down. Set `HEALTH_CHECK_MIROFISH=0` to drop the MiroFish probe. Monitor the worker by its container status and logs.

## Vercel notes

- Plan: Pro (or higher) is required. Hobby caps functions at 60 s, which cuts the 280 s run stream short on every reconnect and kills the interview call, which can take up to 200 s.
- Duration: `apps/web/vercel.json` sets `maxDuration` 300 for `src/app/api/**/*.ts`, and the long routes (`chats/[id]/messages`, `chats/[id]/stream`) also export `maxDuration = 300`.
- Project settings: root directory `apps/web`, framework Next.js, install command `cd ../.. && pnpm install --frozen-lockfile` (install at the repo root), build command left at the default (`next build`). Keep "Include files outside the root directory" enabled; the app imports workspace packages.
- Upload size: Vercel limits request bodies to 4.5 MB, below the app's 10 MB per-file limit, so larger files fail on Vercel until uploads move to presigned URLs.
- Environment:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Managed Postgres URL |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` |
| `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL` | The public URL |
| `MIROFISH_URL` | The proxy's public URL |
| `MIROFISH_TOKEN` | Same value as on the proxy and worker |
| `STORAGE_DRIVER` | `s3` |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE` | The bucket's settings |
| `DEMO_MODE` | `1` |
| `DEMO_PAUSED` | `0` (`1` to pause) |
| `MAX_RUNS_PER_DAY` | `2` |
| `DEMO_MAX_ROUNDS` | `3` |
| `HEALTH_CHECK_MIROFISH` | `1` |

## Limits and costs

Every real run spends LLM tokens on the ontology, persona generation, every agent action in every round and the report agent, plus Zep Cloud usage for the graph. Upstream MiroFish warns about high consumption and suggests trying fewer than 40 rounds first. Cost grows with agent count times rounds and depends on the model and provider, so measure a 1-round run against your provider's usage dashboard before opening access. Keep rounds low: the hosted demo caps them at 3 (`DEMO_MAX_ROUNDS`), and self-hosters exposing the app to others should set `DEMO_MODE=1` for the same caps and quotas. Follow-up questions and interviews also call the LLM.
