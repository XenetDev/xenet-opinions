# Fly.io layout

Hosted demo backend: `mirofish`, `mirofish-proxy` and `worker` as three Fly apps in one org, uploads in a Tigris bucket, Postgres on Neon (provisioned through the Vercel Marketplace so the web app on Vercel and the worker share one URL). The web app is on Vercel; see [docs/hosting-runbook.md](../../docs/hosting-runbook.md) for its settings and variables.

| App | Config | Image or build | Volume | Networking |
| --- | --- | --- | --- | --- |
| `xenet-opinions-mirofish` | `mirofish.toml` | `registry.fly.io/xenet-opinions-mirofish:edge` (relayed from GHCR) | `mirofish_uploads` at `/app/backend/uploads` | private only, `xenet-opinions-mirofish.internal:5001` |
| `xenet-opinions-proxy` | `proxy.toml` | built from `infra/mirofish/Dockerfile.proxy` | none | public HTTPS `xenet-opinions-proxy.fly.dev`, private `xenet-opinions-proxy.internal:8080` |
| `xenet-opinions-worker` | `worker.toml` | `registry.fly.io/xenet-opinions-worker:edge` (relayed from GHCR) | none | private only, no port |

All in `lhr`, one machine each, `auto_stop_machines` off.

## Commands

Run from the repo root. `flyctl` resolves `dockerfile` and `-c` paths relative to the config file, so the proxy passes its Dockerfile explicitly with the MiroFish directory as the build context.

```sh
ORG=opinions-885
flyctl apps create xenet-opinions-mirofish -o $ORG
flyctl apps create xenet-opinions-proxy -o $ORG
flyctl apps create xenet-opinions-worker -o $ORG
flyctl volumes create mirofish_uploads -a xenet-opinions-mirofish -r lhr -s 3 -y
flyctl storage create -n xenet-opinions-seeds -o $ORG -a xenet-opinions-worker -y   # prints the bucket keys once; keep them
```

Secrets (`--stage` until the first deploy):

```sh
flyctl secrets set LLM_API_KEY=... LLM_BASE_URL=https://api.openai.com/v1 LLM_MODEL_NAME=gpt-4o-mini ZEP_API_KEY=... -a xenet-opinions-mirofish --stage
flyctl secrets set MIROFISH_TOKEN=... -a xenet-opinions-proxy --stage
flyctl secrets set DATABASE_URL=... MIROFISH_TOKEN=... S3_BUCKET=xenet-opinions-seeds S3_REGION=auto S3_ENDPOINT=https://fly.storage.tigris.dev S3_ACCESS_KEY_ID=... S3_SECRET_ACCESS_KEY=... S3_FORCE_PATH_STYLE=false -a xenet-opinions-worker --stage
```

`flyctl storage create` sets `AWS_*` secrets on the worker; the worker reads `S3_*`, so set those and `flyctl secrets unset` the `AWS_*` ones.

Images. The GHCR packages are private until made public, and Fly cannot pull private GHCR images, so relay the amd64 images through Fly's registry (`flyctl auth docker` first). Once the packages are public, change `[build] image` back to `ghcr.io/xenetdev/...` and skip this.

```sh
for n in mirofish worker; do
  docker pull --platform linux/amd64 "ghcr.io/xenetdev/xenet-opinions-${n}:edge"
  docker tag "ghcr.io/xenetdev/xenet-opinions-${n}:edge" "registry.fly.io/xenet-opinions-${n}:edge"
  docker push "registry.fly.io/xenet-opinions-${n}:edge"
done
```

Deploy:

```sh
flyctl deploy infra/mirofish -c "$PWD/infra/fly/proxy.toml" --dockerfile "$PWD/infra/mirofish/Dockerfile.proxy" -a xenet-opinions-proxy --ha=false -y
flyctl deploy -c "$PWD/infra/fly/mirofish.toml" -a xenet-opinions-mirofish --ha=false -y
flyctl ssh console -a xenet-opinions-mirofish -C 'chown -R 10001:10001 /app/backend/uploads'   # once: the volume mounts root-owned, the image runs as uid 10001
flyctl deploy -c "$PWD/infra/fly/worker.toml" -a xenet-opinions-worker --ha=false -y
```

Migrate from this machine against the Neon URL: `DATABASE_URL=... pnpm --filter @xo/db db:migrate:prod`.

Checks:

```sh
curl -i https://xenet-opinions-proxy.fly.dev/health          # 200 once MiroFish is up (503 before)
curl -i https://xenet-opinions-proxy.fly.dev/                # 401 unauthorized
curl -i -H "X-MiroFish-Token: $MIROFISH_TOKEN" https://xenet-opinions-proxy.fly.dev/   # anything but 401
flyctl logs -a xenet-opinions-worker
```

The proxy has no HTTP health check of its own because `/health` is forwarded to MiroFish and would fail while MiroFish restarts; Fly's TCP check covers the proxy process.

## Retention

`infra/mirofish/retain.sh` inside the MiroFish machine: `flyctl ssh console -a xenet-opinions-mirofish -C 'sh -c "RETAIN_DAYS=7 /bin/sh -s /app/backend/uploads"' < infra/mirofish/retain.sh` (verify stdin forwarding once; otherwise run the script's loop from an interactive console).
