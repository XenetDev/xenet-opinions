# Hosting

Two supported shapes: a single-host Docker Compose bundle for self-hosting, and the hosted demo (web on Vercel, everything else on a container host). The MiroFish image, token proxy and retention script are described in [infra/mirofish/README.md](../infra/mirofish/README.md).

## Self-host

Requires Docker with Compose v2.20 or later. From the repo root:

```sh
cp .env.selfhost.example .env.selfhost   # then fill in the four required secrets and the two keys
infra/docker/up.sh
```

`infra/docker/up.sh` runs the bundle with the real MiroFish; `infra/docker/up-mock.sh` runs it with the bundled mock instead (no keys needed). Both run from the repo root whatever the current directory, pass their arguments to `docker compose` and default to `up -d`. `up.sh` is short for:

```sh
docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.real.yml --env-file .env.selfhost up -d
```

`BETTER_AUTH_SECRET`, `MIROFISH_TOKEN`, `POSTGRES_PASSWORD` and `MINIO_ROOT_PASSWORD` must be filled in first; until they are, every compose command (including `config`) stops with `set <NAME> in .env.selfhost`. `up.sh` also requires `LLM_API_KEY` and `ZEP_API_KEY` and stops the same way while either is blank. Set `XO_ENV_FILE` (a path relative to the repo root, or absolute) to use an env file other than `.env.selfhost`.

Open http://localhost:3000 (or `XO_WEB_PORT`). `infra/docker/up.sh ps` shows the services; `web` turns healthy once `/api/health` answers 200.

### Images

`web`, `worker` (shared by `migrate` and `mirofish-mock`) and `mirofish` use `ghcr.io/xenetdev/xenet-opinions-web`, `ghcr.io/xenetdev/xenet-opinions-worker` and `ghcr.io/xenetdev/xenet-opinions-mirofish`, tagged `XO_IMAGE_TAG` (default `edge`, the latest `main`; releases are `vX.Y.Z`). With `pull_policy: missing`, compose pulls an image that is not on the host yet when it is published on GHCR, and otherwise builds it locally from the repo's Dockerfiles (after printing a `failed to resolve reference ... not found` pull error for it, which is expected). The first local build of the MiroFish image takes several minutes and produces about 3.9 GB. `worker` is the only service that builds the shared worker image, so on a host with neither the published image nor a local build, run a full `infra/docker/up.sh` (or `infra/docker/up.sh build worker`) before starting `migrate` or `mirofish-mock` on their own (for example `infra/docker/up-mock.sh up -d mirofish-mock`). Images already on the host are reused as they are; run `infra/docker/up.sh pull` (published images) or `infra/docker/up.sh up -d --build` (local builds) to update them. If you checked out a release tag, set `XO_IMAGE_TAG` to the same tag so the images match the code; `edge` follows `main`.

### Services

| Service | Image | Notes |
| --- | --- | --- |
| `postgres` | `postgres:18` | Healthcheck `pg_isready` |
| `minio` | `pgsty/minio` | S3-compatible upload store; console not published |
| `minio-init` | `pgsty/mc` | One-shot, creates the `xo-uploads` bucket |
| `migrate` | `xenet-opinions-worker` | One-shot `pnpm --filter @xo/db db:migrate:prod` once Postgres is healthy |
| `worker` | `xenet-opinions-worker` | Starts after `migrate` succeeds |
| `web` | `xenet-opinions-web` | Starts after `migrate` and `minio-init` succeed; the only published port |
| `mirofish-proxy` | `caddy:2` | Token proxy in front of MiroFish (`infra/mirofish/Caddyfile`) |
| `mirofish` | `xenet-opinions-mirofish` | `docker-compose.real.yml` (`up.sh`); upstream MiroFish backend, runs as uid 10001 |
| `mirofish-mock` | `xenet-opinions-worker` | `docker-compose.mock.yml` (`up-mock.sh`); the bundled mock MiroFish |

`infra/docker/docker-compose.yml` holds every service except MiroFish. `docker-compose.real.yml` adds `mirofish` and `docker-compose.mock.yml` adds `mirofish-mock`; each also points `mirofish-proxy` at its backend (`MIROFISH_UPSTREAM`), so the proxy always matches the backend that is running.

The official `minio/minio` and `minio/mc` images are no longer published on Docker Hub, so the bundle uses `pgsty/minio` and `pgsty/mc`, a community-maintained fork with the same CLI, pinned by digest (multi-arch index):

| Image | Tag | Digest |
| --- | --- | --- |
| `pgsty/minio` | `RELEASE.2026-08-04T00-00-00Z` | `sha256:b6bfe7239bfc83fb90d31612d9704d86039dd714f7904b3f1ad68f211e602372` |
| `pgsty/mc` | `RELEASE.2026-10-18T00-00-00Z` | `sha256:6ecdaec70bc5e8cf9d0e9a70c190f3beb1c83f11617ff4333f1fcd71ab1daf18` |

To move to a newer release, resolve the tag with `docker buildx imagetools inspect pgsty/minio:<tag>` (the `Digest:` line), replace the digest in the compose file and update this table.

Networks: `web` sits on `edge` and `internal`; `worker`, `postgres`, `minio` and the one-shots on `internal`; `mirofish` and `mirofish-mock` on `backend` only. `mirofish-proxy` is the one service on both `internal` and `backend`, so web and worker reach MiroFish only through `http://mirofish-proxy:8080` with the token, and `web` cannot even resolve `mirofish`. No network is marked `internal: true` because MiroFish needs outbound internet for the LLM and Zep.

### Real and mock MiroFish

- Real (`up.sh`): upstream MiroFish. A 1-round run on a 1 KB seed file took about 6 minutes with `gpt-4o-mini` (ontology 17 s, graph 63 s, personas 46 s, simulation 81 s, report about 2 minutes); more rounds, agents or a slower model take longer, and every run spends LLM and Zep credits (see [Limits and costs](#limits-and-costs)). MiroFish writes the report only after its simulation environment has shut down, and answers persona interviews only while that environment is running, so the app closes the environment before the report; persona interviews therefore happen in an optional window before the report (see [Interview window](#interview-window)), and questions to the report work after the run. MiroFish's posts and report come out in Chinese even for an English seed and question.
- Mock (`up-mock.sh`): no keys needed. Runs finish in under a minute. `MOCK_SPEED` divides the mock's simulated stage delays (about 16 s plus 1 s per round at `1`); end-to-end time is dominated by the worker's 2 s poll interval, so values above about 5 make little difference. The mock keeps its simulations in memory, so restarting or recreating `mirofish-mock` makes follow-ups on earlier runs fail.

Use one script consistently for a running stack: both share the project name `xenet-opinions`, and each knows only its own MiroFish service.

**Switching to real MiroFish.**

1. `infra/docker/up-mock.sh down` (no `-v`), so the mock container stops.
2. Fill in `LLM_API_KEY` and `ZEP_API_KEY` in `.env.selfhost` (and optionally `LLM_BASE_URL`, `LLM_MODEL_NAME`).
3. `infra/docker/up.sh`.

Switching back is `infra/docker/up.sh down`, then `infra/docker/up-mock.sh`; the keys can stay in the file.

### Environment

All values live in `.env.selfhost` (see `.env.selfhost.example`). Compose derives `DATABASE_URL=postgresql://xo:${POSTGRES_PASSWORD}@postgres:5432/xo` and the S3 settings itself, so the Postgres password and MinIO credentials are each set in exactly one place.

| Variable | Default | Notes |
| --- | --- | --- |
| `XO_IMAGE_TAG` | `edge` | Tag of the `ghcr.io/xenetdev/xenet-opinions-*` images; `edge` follows `main`, releases are `vX.Y.Z` |
| `XO_WEB_PORT` | `3000` | Host port for `web` |
| `NEXT_PUBLIC_APP_URL` | unset | Public URL. Unset or blank means `http://localhost:${XO_WEB_PORT}`; set it only when the app is served from another origin (a domain or reverse proxy), then recreate `web` |
| `BETTER_AUTH_URL` | unset | Same as `NEXT_PUBLIC_APP_URL`, with the same default; anonymous sign-in fails when it does not match the browser's origin |
| `BETTER_AUTH_SECRET` | blank | Required. `openssl rand -base64 32` |
| `MIROFISH_TOKEN` | blank | Required. `openssl rand -hex 32`; shared by the proxy, web and worker |
| `MIROFISH_LOCALE` | `en` | Language MiroFish writes personas, posts, interview answers and the report in, sent as `Accept-Language` on every call: `en`, `zh`, `es`, `fr`, `pt`, `ru` or `de`. MiroFish falls back to Chinese when the header is missing or unknown |
| `POSTGRES_PASSWORD` | blank | Required. `openssl rand -hex 32`; must be URL-safe because it goes into `DATABASE_URL` |
| `MINIO_ROOT_USER` | `xo-admin` | At least 3 characters. Also the S3 access key |
| `MINIO_ROOT_PASSWORD` | blank | Required. `openssl rand -hex 24` (MinIO needs at least 8 characters). Also the S3 secret key |
| `LLM_API_KEY` | blank | Required by `up.sh`. Any OpenAI-compatible key |
| `LLM_BASE_URL` | `https://api.openai.com/v1` | Real MiroFish |
| `LLM_MODEL_NAME` | `gpt-4o-mini` | Real MiroFish |
| `ZEP_API_KEY` | blank | Required by `up.sh`. Zep Cloud key |
| `MOCK_SPEED` | `5` | Mock MiroFish |
| `DEMO_MODE` | `0` | `1` enables per-user quotas and the rounds cap |
| `DEMO_PAUSED` | `0` | `1` refuses new runs (follow-ups still work) |
| `MAX_RUNS_PER_DAY_ANONYMOUS` | `1` | New runs per guest (not signed in) per 24 h; retries of a failed run are free. Demo mode only |
| `MAX_RUNS_PER_DAY` | `3` | New runs per signed-in user per 24 h; retries of a failed run are free. Demo mode only |
| `RESEND_API_KEY` | blank | Enables the magic link by email. Needs `EMAIL_FROM` |
| `EMAIL_FROM` | blank | Sender, `Name <address>` or a bare address on a domain verified in Resend |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | blank | Enable Google sign-in; set both |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | blank | Enable GitHub sign-in; set both |
| `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET` | blank | Enable Apple sign-in; set both. Not tested yet |
| `APPLE_APP_BUNDLE_IDENTIFIER` | blank | Optional, for native Apple sign-in |
| `DEMO_MAX_ROUNDS` | `3` | Rounds cap, demo mode only |
| `DEMO_ALLOW_PAUSE` | `1` | Read by `web`. `0` hides the "Pause for interviews before the report" checkbox and forces the option off |
| `MOCK_INTERVIEW_DELAY_MS` | `1500` | Mock MiroFish only: delay per interview call, so answers visibly arrive one by one |
| `ENV_KEEPALIVE_MS` | `1200000` | Length of the interview window (20 minutes) |
| `ENV_SWEEP_INTERVAL_MS` | `60000` | Sweeper interval; `0` disables it |

### Demo mode and pause

`DEMO_MODE` and `DEMO_PAUSED` are read by `web` at startup. After editing them in `.env.selfhost`, recreate only `web` (with `up-mock.sh` if you run the mock):

```sh
infra/docker/up.sh up -d web
```

With `DEMO_PAUSED=1` new runs are refused (`demo_paused`) and the composer is disabled in new chats; follow-ups in finished chats keep working. Other variables follow the same pattern: recreate the service that reads them (`MOCK_SPEED` is read by `mirofish-mock`). The web image works on any origin. Changing only `XO_WEB_PORT` needs nothing else; when the app is served from another origin, uncomment `NEXT_PUBLIC_APP_URL` and `BETTER_AUTH_URL`, set both to the public URL and recreate `web`:

```sh
infra/docker/up.sh up -d web
```

### Sign-in providers

Every visitor gets an anonymous session; `/sign-in` adds accounts. Each provider is shown only when its variables are set, and sessions last 30 days. Signing in from an anonymous session moves its chats, uploads and runs to the account, so the 24-hour quota window carries over. A magic link moves them only when it is opened in the browser that requested it; opened elsewhere, it signs in without moving anything. Set the variables in `.env.selfhost` (or in Vercel) and recreate `web`.

- Redirect URIs: register `<APP_URL>/api/auth/callback/google` with Google and `<APP_URL>/api/auth/callback/github` with GitHub, where `<APP_URL>` is `BETTER_AUTH_URL`. A GitHub OAuth app allows one callback URL, so use one app per origin.
- Magic link: set `RESEND_API_KEY` and `EMAIL_FROM`; the sender's domain must be verified in Resend. Without a key the app prints the link to the server log in development and refuses to send in production, and the magic-link option is hidden.
- Account deletion is confirmed by email and removes the user's uploads from storage.

Rate limits are stored in the `rate_limit` table, per client IP:

| Scope | Limit |
| --- | --- |
| All requests | 60 per minute |
| Magic-link requests and account deletion | 3 per minute |
| Anonymous sign-ins | 10 per minute |

The client IP is read from `x-forwarded-for` or `x-real-ip`. Vercel sets the header itself. A self-hosted `web` exposed directly, without a reverse proxy that sets these headers, lets a client choose its own bucket by sending the header. When no request carries either header, Better Auth finds no IP in production and every client shares one bucket, so one visitor can use up the magic-link limit for everyone. Put a reverse proxy that sets `x-forwarded-for` in front of `web`.

### Interview window

A run started with "Pause for interviews before the report" stops after the rounds with its personas online. The window lasts `ENV_KEEPALIVE_MS` (20 minutes by default). Each accepted question (up to 5 personas, one MiroFish call per persona; with real MiroFish and `gpt-4o-mini` each answer took 2 to 5 seconds in testing, and a call gives up after 240 seconds) extends it by 5 minutes per persona, capped at 60 minutes from the start of the pause. Interviews run in the worker, so they survive reloads and closed tabs.

- Generate report, or the window expiring, closes the environment and writes the report. Interviews already asked finish first; new questions are refused.
- Cancelling the run closes the environment. If the environment dies on its own, questions still pending fail with "Agents are offline", the worker notices within about 30 seconds of the last answer and goes on to the report.
- A paused run holds the single worker slot (`MAX_CONCURRENT_RUNS=1`) for the whole window, and queued users see a message that a run is paused for interviews. The hosted demo therefore sets `DEMO_ALLOW_PAUSE=0`; self-hosters get the feature by default.

### Volumes

Compose names them with the project prefix `xenet-opinions_`.

| Volume | Mounted at | Contents |
| --- | --- | --- |
| `postgres-data` | `/var/lib/postgresql` | Users, chats, runs, run events, interviews |
| `minio-data` | `/data` | Uploaded source files |
| `mirofish-uploads` | `/app/backend/uploads` | MiroFish per-run projects, simulations and reports (real MiroFish only) |

`infra/docker/up.sh down` keeps the volumes; `down -v` deletes them.

### Backups

Postgres holds everything the UI shows; back it up regularly:

```sh
infra/docker/up.sh exec -T postgres pg_dump -U xo -Fc xo > xo-$(date +%F).dump
infra/docker/up.sh exec -T postgres pg_restore -U xo -d xo --clean < xo-2026-10-22.dump
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
infra/docker/up.sh up -d --build mirofish
```

MiroFish keeps task state in memory, so any in-flight run is lost on restart; update between runs.

The image runs as uid 10001. A `mirofish-uploads` volume created before that (by an image that ran as root) is root-owned and not writable; fix it once with `docker run --rm -v xenet-opinions_mirofish-uploads:/v alpine chown -R 10001:10001 /v`.

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
- Container host: `worker`, `mirofish-proxy` and `mirofish` on one private network, built from the same Dockerfiles as the bundle (or run from the published `ghcr.io/xenetdev/xenet-opinions-worker` and `ghcr.io/xenetdev/xenet-opinions-mirofish` images; the proxy is `caddy:2` with `infra/mirofish/Caddyfile`, or `infra/mirofish/Dockerfile.proxy` where files cannot be mounted). Their environment is listed under [Container host environment](#container-host-environment). Exactly one MiroFish replica with a persistent volume on `/app/backend/uploads` and the retention cron. MiroFish's port is never public. The proxy is the only public entry point, because Vercel needs to reach it; it requires `X-MiroFish-Token` on everything but `GET /health`. The Caddyfile serves plain HTTP on `:8080` (`auto_https off`), so the container host or platform must terminate TLS in front of it: Railway and Fly do this on their public URLs, a bare VM needs a TLS-terminating reverse proxy. Without TLS the token travels in cleartext.
- Uploads: an S3-compatible bucket (`STORAGE_DRIVER=s3`, `S3_*`) shared by web and worker. For R2 set `S3_ENDPOINT` to the account endpoint, `S3_REGION=auto` and `S3_FORCE_PATH_STYLE=true`.
- Policy: `DEMO_MODE=1` enables the quotas per rolling 24 h (`MAX_RUNS_PER_DAY_ANONYMOUS=1` for guests, `MAX_RUNS_PER_DAY=3` per signed-in user) and the rounds cap (`DEMO_MAX_ROUNDS=3`). Runs queue FIFO with one at a time (`MAX_CONCURRENT_RUNS=1`) and the chat shows the queue position.
- Kill switch: set `DEMO_PAUSED=1` on Vercel and redeploy (or promote) to refuse new runs with `demo_paused`; follow-ups on finished runs keep working. Set it back to `0` to resume.
- Monitoring: poll `GET /api/health` on the public URL. It returns 200 with `{"ok":true,"db":"ok","mirofish":"ok"}` and 503 when Postgres or the proxy (and through it MiroFish) is down. Set `HEALTH_CHECK_MIROFISH=0` to drop the MiroFish probe. Monitor the worker by its container status and logs.

### Container host environment

`mirofish`:

| Variable | Value |
| --- | --- |
| `LLM_API_KEY` | Any OpenAI-compatible key. Required |
| `LLM_BASE_URL` | Provider endpoint, default `https://api.openai.com/v1` |
| `LLM_MODEL_NAME` | Model, default `gpt-4o-mini` |
| `ZEP_API_KEY` | Zep Cloud key. Required |

Never set `ZEP_API_URL` (MiroFish refuses to start) and never mount a `.env` file into the container. Mount a persistent volume at `/app/backend/uploads`, run one replica, and publish no port. Optional tuning variables are in [infra/mirofish/README.md](../infra/mirofish/README.md#mirofish-environment).

`mirofish-proxy`:

| Variable | Value |
| --- | --- |
| `MIROFISH_TOKEN` | `openssl rand -hex 32`. Required; a blank token rejects every call except `/health` |
| `MIROFISH_UPSTREAM` | MiroFish's private address, for example `mirofish:5001` or `mirofish.railway.internal:5001` |

It listens on `:8080` (plain HTTP); the platform terminates TLS on its public URL.

`worker`:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | The managed Postgres URL (private address where the host offers one) |
| `MIROFISH_URL` | The proxy's private address, for example `http://mirofish-proxy:8080` |
| `MIROFISH_TOKEN` | Same value as on the proxy and Vercel |
| `MIROFISH_LOCALE` | `en` (or another language MiroFish supports) |
| `STORAGE_DRIVER` | `s3` |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE` | The same bucket settings as Vercel |
| `MAX_CONCURRENT_RUNS` | `1` |
| `ENV_KEEPALIVE_MS` | `1200000` (20 minutes; the interview window length) |
| `ENV_SWEEP_INTERVAL_MS` | `60000` |
| `WORKER_POLL_MS` | Optional, default `2000` |
| `WORKER_ID` | Optional lease owner name, default host and pid; leave unset rather than blank |

Railway-specific values (`PORT`, `RAILWAY_DOCKERFILE_PATH`, `${{Postgres.DATABASE_URL}}`) are in [infra/railway/README.md](../infra/railway/README.md).

## Vercel notes

- Plan: functions need Fluid compute, which is on by default for new projects. With it, Hobby allows up to 300 s per function (default and maximum) and Pro allows 300 s by default and up to 800 s (checked against Vercel's [function limits](https://vercel.com/docs/functions/limitations) in October 2026). The app's 300 s routes therefore fit on Hobby. Pro is still recommended: Hobby is limited to non-commercial personal use, and its included monthly usage (4 active CPU hours, 360 GB-hours of provisioned memory) can be used up by run streams, which hold a function open for minutes at a time; once exceeded, Hobby pauses the feature until 30 days have passed.
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
| `MIROFISH_LOCALE` | Same value as on the worker |
| `STORAGE_DRIVER` | `s3` |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE` | The bucket's settings |
| `DEMO_MODE` | `1` |
| `DEMO_PAUSED` | `0` (`1` to pause) |
| `DEMO_ALLOW_PAUSE` | `0` |
| `MAX_RUNS_PER_DAY_ANONYMOUS` | `1` |
| `MAX_RUNS_PER_DAY` | `3` |
| `RESEND_API_KEY`, `EMAIL_FROM`, `GOOGLE_*`, `GITHUB_*`, `APPLE_*` | Optional sign-in providers, see [Sign-in providers](#sign-in-providers) |
| `DEMO_MAX_ROUNDS` | `3` |
| `HEALTH_CHECK_MIROFISH` | `1` |

## Limits and costs

Every real run spends LLM tokens on the ontology, persona generation, every agent action in every round and the report agent, plus Zep Cloud usage for the graph. Upstream MiroFish warns about high consumption and suggests trying fewer than 40 rounds first. Cost grows with agent count times rounds and depends on the model and provider, so measure a 1-round run against your provider's usage dashboard before opening access. Keep rounds low: the hosted demo caps them at 3 (`DEMO_MAX_ROUNDS`), and self-hosters exposing the app to others should set `DEMO_MODE=1` for the same caps and quotas. Follow-up questions and interviews also call the LLM.
