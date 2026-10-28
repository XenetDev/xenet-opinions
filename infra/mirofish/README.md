# MiroFish backend image and token proxy

Production runs the upstream MiroFish backend in its own container, behind a Caddy sidecar that checks a shared token. The web app and worker reach MiroFish only through the proxy.

| File | Purpose |
| --- | --- |
| `Dockerfile` | Builds the unmodified upstream backend at a pinned commit |
| `Caddyfile` | Token proxy on `:8080` in front of the backend |
| `Dockerfile.proxy` | `caddy:2` with the Caddyfile baked in, for hosts that cannot bind-mount files (Railway) |
| `caddyfile.test.sh` | `caddy validate` plus a live check of the proxy rules (needs Docker) |
| `retain.sh` | Deletes per-run folders older than `RETAIN_DAYS` from the uploads volume |

## AGPL boundary

MiroFish ([666ghj/MiroFish](https://github.com/666ghj/MiroFish)) is AGPL-3.0. This repository is MIT and stays clean-room:

- We never vendor, copy or patch MiroFish code. The `Dockerfile` fetches upstream at build time and runs it as is.
- Our code talks to MiroFish over HTTP only (`@xo/mirofish` is an independent typed client).
- The upstream version is pinned by commit SHA in `ARG MIROFISH_REF`, currently `7657031ac01184afe2cb220f5ee3545573b5e843`.

Because MiroFish runs as a network service, AGPL section 13 applies to it; the exact source we run is the pinned SHA on the public upstream repository.

The published image `ghcr.io/xenetdev/xenet-opinions-mirofish` is the upstream MiroFish backend, unmodified, at commit `7657031ac01184afe2cb220f5ee3545573b5e843`. Its source is https://github.com/666ghj/MiroFish at that commit. The image keeps the upstream licence at `/app/LICENSE` and carries the OCI labels `org.opencontainers.image.source`, `org.opencontainers.image.revision`, `org.opencontainers.image.licenses=AGPL-3.0` and `org.opencontainers.image.description`. The only additions are the base image, the locked Python dependencies and a non-root user. One dependency is swapped after the lockfile sync: `torch` is reinstalled from the PyTorch CPU index at the locked version and the NVIDIA CUDA wheels it pulled in are removed, because the image runs on CPU-only machines and the CUDA stack alone is about 6 GB on linux/amd64, more than Fly's uncompressed image limit.

### Bumping `MIROFISH_REF`

1. Pick the new upstream commit and read its diff for API changes against `packages/mirofish` (routes, payloads, the `/health` route, `Config.validate()`, `backend/pyproject.toml` Python range).
2. Edit `ARG MIROFISH_REF` in `Dockerfile` to the full 40-character SHA (or pass `--build-arg MIROFISH_REF=<sha>` to try it first).
3. Rebuild and run the checks below, then a real end-to-end run, and refresh the client fixtures with `pnpm --filter @xo/mirofish capture-fixtures`.

## Build and checks

```sh
docker build -f infra/mirofish/Dockerfile -t xo-mirofish infra/mirofish
docker run --rm xo-mirofish uv run python -c "import flask, camel, zep_cloud, fitz"
docker run --rm xo-mirofish id -u   # 10001
docker run --rm xo-mirofish head -1 /app/LICENSE   # GNU AFFERO GENERAL PUBLIC LICENSE
docker run --rm xo-mirofish   # exits 1: "配置错误: - LLM_API_KEY 未配置 - ZEP_API_KEY 未配置"
sh infra/mirofish/caddyfile.test.sh
sh infra/mirofish/retain.sh --self-test
```

The image is backend-only (`python:3.11-slim`; upstream requires Python `>=3.11,<3.13`). `gcc` and `libc6-dev` are installed because `psutil` 5.9.8 (pulled in by `camel-ai`) has no prebuilt wheel for linux/arm64 and builds from source there. The image is a few gigabytes, almost all of it the locked Python dependencies; `uv` is installed from PyPI (pinned) rather than copied from GHCR so builds do not depend on a second registry.

The backend runs as the non-root user `mirofish` (uid 10001). It owns `/app/backend/uploads` and `/app/backend/logs` (upstream's logger writes there); everything else in `/app` is read-only to it.

## MiroFish environment

Set these on the `mirofish` container. Variables are read by `backend/app/config.py`.

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `LLM_API_KEY` | yes | | OpenAI-compatible API key |
| `LLM_BASE_URL` | no | `https://api.openai.com/v1` | Any OpenAI-compatible endpoint |
| `LLM_MODEL_NAME` | no | `gpt-4o-mini` | |
| `ZEP_API_KEY` | yes | | Zep Cloud key |
| `ZEP_API_URL` | must not be set | | MiroFish supports Zep Cloud only; startup fails if this is set |
| `OASIS_DEFAULT_MAX_ROUNDS` | no | `10` | |
| `REPORT_AGENT_MAX_TOOL_CALLS` | no | `5` | |
| `REPORT_AGENT_MAX_REFLECTION_ROUNDS` | no | `2` | |
| `REPORT_AGENT_TEMPERATURE` | no | `0.5` | |

`run.py` calls `Config.validate()` and exits 1 when `LLM_API_KEY` or `ZEP_API_KEY` is missing or `ZEP_API_URL` is set. The image sets `FLASK_HOST=0.0.0.0` and `FLASK_PORT=5001`; leave `FLASK_DEBUG` unset.

Pass configuration as container environment, not a file. Upstream loads `/app/.env` with `override=True` if it exists, which would beat the container environment, so never mount one.

## Single process only

The backend is Flask's built-in server with `threaded=True` in one process. Task state lives in an in-memory singleton (`TaskManager`) and simulations run as child processes of that server (`scripts/run_parallel_simulation.py`). Run exactly one replica, never scale it, and expect in-flight tasks to be lost on restart.

## Volume

All per-run state lives under `/app/backend/uploads`. The image declares no `VOLUME`, so the operator must mount a named volume at exactly `/app/backend/uploads` (compose does this). A new, empty named volume takes the directory's `mirofish` ownership from the image. A volume created by an older image that ran as root stays root-owned; fix it once with `docker run --rm -v <volume>:/v alpine chown -R 10001:10001 /v`. Platform volumes (Railway, Fly) always mount root-owned and need the same one-off `chown -R 10001:10001 /app/backend/uploads` as root; see [docs/hosting-runbook.md](../../docs/hosting-runbook.md). Without it the state is lost on every container recreate, and an anonymous volume would sit outside the path `retain.sh` cleans:

- `projects/<project_id>/` from graph builds
- `simulations/<simulation_id>/` from simulation prepare and run
- `reports/<report_id>/` from report generation

## Token proxy

The Caddy sidecar listens on `:8080` and takes two env vars:

- `MIROFISH_TOKEN`: the shared secret. Use the same value as the web app's and worker's `MIROFISH_TOKEN`; the client sends it as `X-MiroFish-Token`. Generate it with `openssl rand -hex 32` (letters and digits only; it is substituted into the Caddyfile verbatim).
- `MIROFISH_UPSTREAM`: the backend address, e.g. `mirofish:5001`.

Rules:

- `GET /health` (and HEAD) is proxied without a token; the upstream only ever receives `/health` on that path.
- Any other request whose `X-MiroFish-Token` is not exactly `MIROFISH_TOKEN` gets `401` with `{"success":false,"error":"unauthorized"}` and `Content-Type: application/json`. An empty `MIROFISH_TOKEN` rejects everything except `/health`.
- Everything else is reverse-proxied with a 900 s read and write timeout, because ontology and report calls take minutes.

Point the web app and worker at the proxy (`MIROFISH_URL=http://mirofish-proxy:8080`) and never publish the backend's port 5001. A blank `MIROFISH_TOKEN` on the web app makes `/api/health` answer 503 with `"mirofish":"unauthorized"` instead of failing silently.

### Why the token lives in Caddy

The design spec planned a small fork of MiroFish adding a token check. A fork means carrying modified AGPL code, and our repo would have to host and publish it. A sidecar keeps upstream unmodified and keeps all of our code on the far side of an HTTP boundary.

The spec's other fork patches (traceback stripping in error responses, platform sanitising) are not planned while upstream runs unmodified. MiroFish error bodies are treated as untrusted instead: tracebacks are never shown and a failed run shows at most the first line of the message, capped at 300 characters. The token is the only authentication in front of MiroFish; see [SECURITY.md](../../SECURITY.md).

## Retention

`retain.sh <uploads-dir>` deletes subfolders of `projects/`, `simulations/` and `reports/` whose modification time is older than `RETAIN_DAYS` (default 7), using `find -mindepth 1 -maxdepth 1 -type d -mtime +N`. Run it from the host's crontab against the volume's data directory:

```cron
0 3 * * * RETAIN_DAYS=7 /opt/xo/retain.sh /var/lib/docker/volumes/<volume>/_data
```

`retain.sh --self-test` builds a temporary tree and checks that only the old folders are removed.

Limitations:

- `-mtime +N` rounds differently: GNU find drops the fractional day (with `RETAIN_DAYS=7` a folder must be at least 8 days old), BSD find rounds up (older than 7 days). Either way nothing younger than `RETAIN_DAYS` days is deleted.
- A directory's mtime changes only when entries are added to or removed from it directly. A run that keeps writing only into nested folders for longer than `RETAIN_DAYS` could be removed while in use. Runs take minutes to hours, so 7 days leaves a wide margin.
- After deletion, MiroFish no longer knows those project, simulation and report IDs.
