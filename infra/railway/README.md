# Railway layout

Project `xenet-opinions`, one environment (`production`). Step-by-step commands are in [docs/hosting-runbook.md](../../docs/hosting-runbook.md). Service names matter: they form the private hostnames and the variable references below.

| Service | Source | Build | Volume | Networking | Healthcheck |
| --- | --- | --- | --- | --- | --- |
| `Postgres` | Railway Postgres (`railway add -d postgres`) | managed | managed | private `postgres.railway.internal:5432`; public TCP proxy for Vercel and migrations | none |
| `mirofish` | `infra/mirofish` uploaded as the build root | `Dockerfile` | `/app/backend/uploads` | private only, port 5001, no domain | `/health` on 5001 |
| `mirofish-proxy` | `infra/mirofish` uploaded as the build root | `Dockerfile.proxy` (`RAILWAY_DOCKERFILE_PATH`) | none | private `mirofish-proxy.railway.internal:8080` and a public HTTPS domain targeting port 8080 | `/health` on 8080 |
| `worker` | repo root | `infra/docker/Dockerfile.worker` (`RAILWAY_DOCKERFILE_PATH`) | none | private only, no port, no domain | none (watch status and logs) |

## Environment per service

`mirofish`

| Variable | Value |
| --- | --- |
| `LLM_API_KEY` | OpenAI-compatible key |
| `LLM_BASE_URL` | e.g. `https://api.openai.com/v1` |
| `LLM_MODEL_NAME` | e.g. `gpt-4o-mini` |
| `ZEP_API_KEY` | Zep Cloud key |

Never set `ZEP_API_URL`, and never mount a `.env` file.

`mirofish-proxy`

| Variable | Value |
| --- | --- |
| `MIROFISH_TOKEN` | `openssl rand -hex 32` |
| `MIROFISH_UPSTREAM` | `mirofish.railway.internal:5001` |
| `PORT` | `8080` (tells Railway which port the domain targets) |
| `RAILWAY_DOCKERFILE_PATH` | `Dockerfile.proxy` |

`worker`

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `MIROFISH_URL` | `http://mirofish-proxy.railway.internal:8080` |
| `MIROFISH_TOKEN` | same as the proxy |
| `STORAGE_DRIVER` | `s3` |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE` | the bucket's settings (R2: region `auto`, path style `true`) |
| `ENV_KEEPALIVE_MS` | `1200000` |
| `ENV_SWEEP_INTERVAL_MS` | `60000` |
| `MAX_CONCURRENT_RUNS` | `1` |
| `RAILWAY_DOCKERFILE_PATH` | `infra/docker/Dockerfile.worker` |

## Private-network hostnames

| Hostname | Used by |
| --- | --- |
| `postgres.railway.internal:5432` | `worker` (through `DATABASE_URL`) |
| `mirofish.railway.internal:5001` | `mirofish-proxy` only |
| `mirofish-proxy.railway.internal:8080` | `worker` |

Vercel cannot use private hostnames. It reaches MiroFish through the proxy's public HTTPS domain and Postgres through the public TCP proxy URL (`DATABASE_PUBLIC_URL`).

## Notes

- Railway ignores the `HEALTHCHECK` lines in Dockerfiles. Set the healthcheck path per service in the dashboard (Settings, Deploy) or in config as code.
- Railway volumes attach to one service, so the retention job must run inside `mirofish` (see the runbook).
- `mirofish` must stay at one replica.
- The `mirofish` image runs as uid 10001 and the Railway volume mounts root-owned. Chown it once after attaching it (recommended): set `RAILWAY_RUN_UID=0`, redeploy, `railway ssh --service mirofish -- chown -R 10001:10001 /app/backend/uploads`, remove `RAILWAY_RUN_UID`, redeploy. Or keep `RAILWAY_RUN_UID=0` set, which runs MiroFish as root. Steps in the runbook.
