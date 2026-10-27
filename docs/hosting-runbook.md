# Hosted demo runbook

Deploys the hosted demo: web on Vercel, `Postgres`, `mirofish`, `mirofish-proxy` and `worker` on Railway, uploads in an S3-compatible bucket. Architecture, limits and the variable reference are in [hosting.md](hosting.md); the per-service table is in [infra/railway/README.md](../infra/railway/README.md).

Nothing here has been executed yet. The container images are published to `ghcr.io/xenetdev/xenet-opinions-web`, `ghcr.io/xenetdev/xenet-opinions-worker` and `ghcr.io/xenetdev/xenet-opinions-mirofish` by the release workflow on each tag (`vX.Y.Z`, with `edge` for `main`); until the first release, `up.sh` builds them locally. The steps below build from source on Railway, but a host that runs images can use those instead, with the same variables. To run the whole stack on one machine instead, use `infra/docker/up.sh` (see [hosting.md](hosting.md#self-host)). Commands were checked against `--help` of `railway` 5.28.0 and `vercel` 54.18.7. Items marked "verify in the dashboard" could not be confirmed from the CLI. Run everything from the repo root unless a step says otherwise.

## 1. Prerequisites and credentials

1. Tools: `railway` (5.28 or later), `vercel` (54 or later), `pnpm`, `openssl`, `curl`.
2. Accounts:
   - Railway: `railway login`, then `railway whoami`.
   - Vercel Pro (recommended) or Hobby: `vercel login`, then `vercel whoami`. Hobby allows the 300 s functions with Fluid compute but is non-commercial only and has small included usage; see [hosting.md](hosting.md#vercel-notes).
3. S3-compatible bucket (Cloudflare R2 or AWS S3) for uploads, and a key pair that can read, write and delete in it. Note bucket name, region, endpoint, access key id, secret key. R2: region `auto`, endpoint `https://<account>.r2.cloudflarestorage.com`, path style `true`. S3: real region, no endpoint, path style `false`.
4. LLM: an OpenAI-compatible API key, base URL and model name.
5. Zep Cloud API key.
6. Generate and keep the secrets (a password manager is fine; do not commit them):

```sh
export MIROFISH_TOKEN=$(openssl rand -hex 32)
export BETTER_AUTH_SECRET=$(openssl rand -base64 32)
```

`MIROFISH_TOKEN` must be letters and digits only; it is substituted into the Caddyfile verbatim.

7. Export the bucket and LLM values for the commands below:

```sh
export S3_BUCKET=... S3_REGION=auto S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com
export S3_ACCESS_KEY_ID=... S3_SECRET_ACCESS_KEY=... S3_FORCE_PATH_STYLE=true
export LLM_API_KEY=... LLM_BASE_URL=https://api.openai.com/v1 LLM_MODEL_NAME=gpt-4o-mini
export ZEP_API_KEY=...
```

## 2. Railway

CLI notes: `railway add`, `variable set`, `volume add`, `domain`, `up` and `run` are confirmed from `--help`. Equivalent Railway MCP tools: `create_project`, `create_service`, `connect_service_source`, `create_volume`, `set_variables`, `generate_domain`, `deploy`, `list_variables`, `get_logs`.

### 2.1 Project and database

```sh
railway init --name xenet-opinions
railway add --database postgres
railway service list
```

`railway init` links this directory to the project. The database service is normally named `Postgres`; use the name `railway service list` prints in the `${{Postgres.*}}` references below.

### 2.2 `mirofish`

```sh
railway add --service mirofish \
  --variables "LLM_API_KEY=$LLM_API_KEY" \
  --variables "LLM_BASE_URL=$LLM_BASE_URL" \
  --variables "LLM_MODEL_NAME=$LLM_MODEL_NAME" \
  --variables "ZEP_API_KEY=$ZEP_API_KEY"
railway volume add --service mirofish --mount-path /app/backend/uploads
railway up infra/mirofish --path-as-root --service mirofish --detach
```

- No `railway domain` for this service: it stays private (`mirofish.railway.internal:5001`).
- The image is about 3.9 GB and the first build takes several minutes.
- Keep it at one replica. Do not set `ZEP_API_URL`.
- The image runs as uid 10001 (`mirofish`), but a Railway volume mounts root-owned, so MiroFish cannot write its uploads until the volume is chowned. Recommended, once after the volume is attached: set `RAILWAY_RUN_UID=0` on `mirofish` and let it redeploy, run `railway ssh --service mirofish -- chown -R 10001:10001 /app/backend/uploads`, then delete `RAILWAY_RUN_UID` and let it redeploy as uid 10001 (the chown needs root, hence the temporary variable). The alternative is to leave `RAILWAY_RUN_UID=0` set permanently, which runs MiroFish as root. Check with `railway ssh --service mirofish -- ls -ld /app/backend/uploads` (owner `mirofish`).
- Healthcheck: set path `/health` in the service settings. Verify in the dashboard (the CLI help shows no healthcheck flag).
- Verify in the dashboard that `railway up ... --path-as-root` used `infra/mirofish` as the build root and picked up `Dockerfile` (Settings, Build).

### 2.3 `mirofish-proxy`

Railway cannot bind-mount the Caddyfile, so the proxy builds from `infra/mirofish/Dockerfile.proxy` (`FROM caddy:2` plus the Caddyfile).

```sh
railway add --service mirofish-proxy \
  --variables "MIROFISH_TOKEN=$MIROFISH_TOKEN" \
  --variables "MIROFISH_UPSTREAM=mirofish.railway.internal:5001" \
  --variables "PORT=8080" \
  --variables "RAILWAY_DOCKERFILE_PATH=Dockerfile.proxy"
railway up infra/mirofish --path-as-root --service mirofish-proxy --detach
railway domain --service mirofish-proxy --port 8080
```

`railway domain` prints the public URL, `https://<name>.up.railway.app`. Record it as `PROXY_URL`. Railway terminates TLS there; the Caddyfile serves plain HTTP on 8080.

- Healthcheck path `/health` (unauthenticated `GET`). Verify in the dashboard.
- `RAILWAY_DOCKERFILE_PATH` is Railway's documented way to select a non-default Dockerfile; verify in the dashboard (Settings, Build) that the service shows `Dockerfile.proxy`.

Check the proxy:

```sh
curl -i "$PROXY_URL/health"
curl -i "$PROXY_URL/"
curl -i -H "X-MiroFish-Token: $MIROFISH_TOKEN" "$PROXY_URL/"
```

The first returns 200 once MiroFish is up. The second returns 401 `{"success":false,"error":"unauthorized"}`. The third reaches MiroFish, so any status other than 401 (a 404 from Flask is fine) proves the token matches.

### 2.4 `worker`

The build context is the repo root, so upload the whole repo (the root `.dockerignore` already excludes `.git`, `node_modules`, `.env`).

```sh
railway add --service worker \
  --variables 'DATABASE_URL=${{Postgres.DATABASE_URL}}' \
  --variables "MIROFISH_URL=http://mirofish-proxy.railway.internal:8080" \
  --variables "MIROFISH_TOKEN=$MIROFISH_TOKEN" \
  --variables "STORAGE_DRIVER=s3" \
  --variables "S3_BUCKET=$S3_BUCKET" \
  --variables "S3_REGION=$S3_REGION" \
  --variables "S3_ENDPOINT=$S3_ENDPOINT" \
  --variables "S3_ACCESS_KEY_ID=$S3_ACCESS_KEY_ID" \
  --variables "S3_SECRET_ACCESS_KEY=$S3_SECRET_ACCESS_KEY" \
  --variables "S3_FORCE_PATH_STYLE=$S3_FORCE_PATH_STYLE" \
  --variables "ENV_KEEPALIVE_MS=1200000" \
  --variables "ENV_SWEEP_INTERVAL_MS=60000" \
  --variables "MAX_CONCURRENT_RUNS=1" \
  --variables "RAILWAY_DOCKERFILE_PATH=infra/docker/Dockerfile.worker"
railway up . --service worker --detach
```

Verify in the dashboard that the reference `${{Postgres.DATABASE_URL}}` resolved (Variables tab shows the value) and that the build used `infra/docker/Dockerfile.worker`. Variables can be changed later with `railway variable set NAME=value --service worker` (this redeploys unless `--skip-deploys`).

### 2.5 Migrate

Run once after Postgres exists, and again before any deploy that adds migrations. Preferred, inside the worker container over the private network:

```sh
railway ssh --service worker -- pnpm --filter @xo/db db:migrate:prod
```

Alternative from this machine through the Postgres public TCP proxy (enable it on the `Postgres` service under Settings, Networking; the template normally exposes `DATABASE_PUBLIC_URL`; verify in the dashboard):

```sh
railway run --service Postgres -- sh -c 'DATABASE_URL="$DATABASE_PUBLIC_URL" pnpm --filter @xo/db db:migrate:prod'
```

Fetch the public URL for Vercel:

```sh
railway variable list --service Postgres --kv | grep '^DATABASE_PUBLIC_URL='
```

Check worker logs: `railway logs --service worker --lines 50`.

## 3. Vercel

### 3.1 Create and link the project

Link from the repo root rather than `apps/web`: the project's root directory is `apps/web`, and Vercel applies it to whatever the CLI uploads, so uploading from `apps/web` would look for `apps/web/apps/web`.

```sh
vercel link --yes --project xenet-opinions
```

`--yes` creates the project when it does not exist. Add `.vercel` to `.gitignore` if the CLI did not.

### 3.2 Project settings

Root directory `apps/web`, install command `cd ../.. && pnpm install --frozen-lockfile`, build command default, framework Next.js, "Include files outside the root directory" on. Set them in the dashboard (Settings, Build and Deployment), or through the API (beta in this CLI; verify in the dashboard that they stuck):

```sh
vercel api /v9/projects/xenet-opinions -X PATCH \
  -F rootDirectory=apps/web \
  -F installCommand='cd ../.. && pnpm install --frozen-lockfile' \
  -F framework=nextjs
```

### 3.3 Environment

`vercel env add <name> <environment> --value <v> --yes` is non-interactive. Use `--sensitive` for secrets. Run each line for `production` (add `preview` only if previews should work; they would share the production database).

```sh
add() { vercel env add "$1" production --value "$2" --yes ${3:+--sensitive}; }

add DATABASE_URL "<DATABASE_PUBLIC_URL from step 2.5>" s
add BETTER_AUTH_SECRET "$BETTER_AUTH_SECRET" s
add BETTER_AUTH_URL "https://<app-domain>"
add NEXT_PUBLIC_APP_URL "https://<app-domain>"
add MIROFISH_URL "$PROXY_URL"
add MIROFISH_TOKEN "$MIROFISH_TOKEN" s
add STORAGE_DRIVER s3
add S3_BUCKET "$S3_BUCKET"
add S3_REGION "$S3_REGION"
add S3_ENDPOINT "$S3_ENDPOINT"
add S3_ACCESS_KEY_ID "$S3_ACCESS_KEY_ID" s
add S3_SECRET_ACCESS_KEY "$S3_SECRET_ACCESS_KEY" s
add S3_FORCE_PATH_STYLE "$S3_FORCE_PATH_STYLE"
add DEMO_MODE 1
add DEMO_PAUSED 0
add MAX_RUNS_PER_DAY 2
add DEMO_MAX_ROUNDS 3
add HEALTH_CHECK_MIROFISH 1
```

`<app-domain>` is `xenet-opinions.vercel.app` unless you attach a custom domain (`vercel domains add <domain>`). Confirm with `vercel env ls production`.

### 3.4 Deploy

```sh
vercel deploy --prod
```

Deploy only after section 2 is healthy and migrated.

## 4. Verification

1. Health:

```sh
curl -s https://<app-domain>/api/health
```

Expect HTTP 200 and `{"ok":true,"db":"ok","mirofish":"ok"}`. A 503 names the failing dependency: `db` means check `DATABASE_URL` and the Postgres public proxy; `mirofish` means check `MIROFISH_URL`, `MIROFISH_TOKEN` equality on all three services, and proxy logs.

2. One 1-round run end to end. Open the app, start a chat, upload a small text file as the seed, ask a question, and set rounds to 1. A 1-round run took about 6 minutes on a local stack with `gpt-4o-mini`; budget more for more rounds or a slower model. Watch `railway logs --service worker` and `railway logs --service mirofish`. Afterwards check the LLM and Zep usage dashboards to measure the cost of a 1-round run before sharing the URL.

3. Kill switch:

```sh
vercel env rm DEMO_PAUSED production --yes
vercel env add DEMO_PAUSED production --value 1 --yes
vercel deploy --prod
```

A new run is now refused with `demo_paused` and the composer is disabled; follow-ups on finished runs still work. Repeat with `0` to resume. (Alternatively edit the variable in the dashboard and redeploy.)

4. MiroFish image labels, after each release. The published image must keep the upstream AGPL provenance:

```sh
docker inspect ghcr.io/xenetdev/xenet-opinions-mirofish:<tag> --format '{{json .Config.Labels}}'
```

Expect `org.opencontainers.image.licenses` to be `AGPL-3.0` and `org.opencontainers.image.source` to be `https://github.com/666ghj/MiroFish`; `ai.xenet.opinions.packaging-revision` names the packaging commit in this repo.

## 5. Operations

### Retention for the MiroFish volume

A Railway volume attaches to one service, so a separate cron service cannot reach it. Run `infra/mirofish/retain.sh` inside `mirofish` by streaming it over `railway ssh`, scheduled from any scheduler you already have (a GitHub Actions cron with a Railway token, or your own crontab):

```sh
railway ssh --service mirofish -- sh -s -- /app/backend/uploads < infra/mirofish/retain.sh
```

With `RETAIN_DAYS` defaulting to 7 inside the script. This relies on `railway ssh` forwarding stdin to the remote command, which is not documented in `--help`; verify it once by hand, and if it does not work, run `railway ssh --service mirofish` and execute the script's `find` loop interactively (see `infra/mirofish/README.md#retention`).

Check usage: `railway volume list` and `railway volume browse /`.

### Rotate `MIROFISH_TOKEN`

The token must change on `mirofish-proxy`, `worker` and Vercel together; expect a short window where runs fail.

```sh
NEW=$(openssl rand -hex 32)
railway variable set "MIROFISH_TOKEN=$NEW" --service mirofish-proxy --skip-deploys
railway variable set "MIROFISH_TOKEN=$NEW" --service worker --skip-deploys
vercel env rm MIROFISH_TOKEN production --yes
vercel env add MIROFISH_TOKEN production --value "$NEW" --yes --sensitive
railway redeploy --service mirofish-proxy --yes
railway redeploy --service worker --yes
vercel deploy --prod
```

Do it when no run is active (MiroFish itself does not hold the token, so in-flight simulations keep going, but the worker's polling would fail until it restarts).

### Pause and resume

Use the kill switch in section 4. To stop the worker as well, remove its latest deployment in the dashboard, or try `railway service scale` (verify in the dashboard how to scale to zero).

### Costs

- Railway: usage-based (CPU, memory, volume, egress). `mirofish` is the heavy service; a 3.9 GB image sits idle between runs. The Hobby plan is the minimum; check the plan's included resource limits against the MiroFish memory need (verify in the dashboard).
- Vercel: Pro seat plus function time; run streams hold a function open for up to 300 s per connection, which is also what eats into Hobby's included usage.
- LLM and Zep: dominant cost, scaling with agents times rounds. `DEMO_MAX_ROUNDS=3`, `MAX_RUNS_PER_DAY=2` per anonymous user and `MAX_CONCURRENT_RUNS=1` bound it; the global daily budget is not capped, so keep `DEMO_PAUSED` handy and set provider-side spend limits.
- Bucket: R2 has no egress fees and uploads are small.

### Alternatives

Fly.io works the same way: one app per service built from the same Dockerfiles (`fly launch --dockerfile infra/mirofish/Dockerfile`, a Fly volume at `/app/backend/uploads`, which mounts root-owned while the image runs as uid 10001, so chown it once with `fly ssh console -C 'chown -R 10001:10001 /app/backend/uploads'` after the first deploy; `.flycast` or `.internal` hostnames for private networking, public TLS on the proxy app only). A plain VM can run the compose bundle with `infra/docker/up.sh` (see [hosting.md](hosting.md#real-and-mock-mirofish)); put a TLS-terminating reverse proxy such as Caddy or nginx in front of `web` (or of `mirofish-proxy` if the web app stays on Vercel), because the bundled Caddyfile serves plain HTTP and the token would otherwise travel in cleartext.
