# Xenet Opinions

Xenet Opinions is an open-source, chat-first interface for [MiroFish](https://github.com/666ghj/MiroFish) simulations. Attach a few documents, ask a question about how people would react, and the chat walks through the whole run as it happens: the knowledge graph, the generated personas, the simulation round by round and the final report. When the run is done you can ask the report agent follow-up questions. Runs survive reloads, worker restarts and closed tabs, and can be cancelled or retried from the stage that failed.

## Interviewing personas

Turn on "Pause for interviews" in the composer when you start a run. After the simulation rounds the personas stay online for 20 minutes. Pick up to 5 of them from the roster and ask a question; the answers arrive one by one, usually within seconds each with real MiroFish (a persona that does not answer within 4 minutes is marked failed), and every question you ask extends the window (5 minutes per persona, up to 60 minutes in total). Press Generate report when you are done, or wait for the window to end; the report is written either way. Runs without it go straight to the report. Report follow-up questions work after the run as before. Interviews are not possible after the report, because upstream MiroFish writes the report only after the simulation process exits and personas exist only while it runs; the background is in the [Phase 5 follow-ups](docs/superpowers/plans/2026-10-23-phase-5-followups.md) and the [design](docs/superpowers/specs/2026-10-27-interview-window-design.md).

## Signing in

Every visitor starts with an anonymous session. Sign in from the header or the usage bar opens a dialog over the current page (`/sign-in` links land in the app with the same dialog open); it offers a magic link by email, Google and GitHub; each option appears only when its environment variables are set. Signing in from an anonymous session moves that visitor's chats, uploads and runs to the account. In demo mode guests get 1 run a day and signed-in users get 3. Signed-in users can sign out or delete their account from the avatar menu in the header. Setup is in [docs/hosting.md](docs/hosting.md#sign-in-providers).

## Architecture

```
                 +-------------+       +----------+       +--------+
  browser -----> | web (Next)  | ----> | Postgres | <---- | worker |
                 +-------------+       +----------+       +--------+
                    |      |                                 |   |
                    |      |  uploads   +------------+       |   |
                    |      +----------> | S3 / MinIO | <-----+   |
                    |                   +------------+           |
                    |  HTTP + X-MiroFish-Token                   |
                    +-------------------------+  +---------------+
                                              v  v
                                  +-------------------+
                                  | Caddy token proxy |
                                  +-------------------+
  ================================= HTTP only ==================================
                                              |       MIT above, AGPL below
                                              v
                                  +-------------------+
                                  |     MiroFish      | ----> LLM API, Zep Cloud
                                  | upstream, as is   |
                                  +-------------------+
```

- **web** (`apps/web`, Next.js) serves the chat, stores messages and runs in Postgres, and streams run progress by tailing the `run_events` table. It calls MiroFish directly only for follow-up questions, interviews and the health check.
- **worker** (`apps/worker`) claims queued runs from Postgres and drives them through MiroFish stage by stage, recording every step.
- **Uploads** go to S3 or any S3-compatible store (MinIO in the Docker bundle, the local disk in development), shared by web and worker.
- **Conversation ids** are generated in the browser and the conversation is created on first use, so a new conversation never waits on the server.
- **MiroFish** runs unmodified behind a Caddy proxy that checks a shared token. Nothing in this repository imports MiroFish code; the only contact is HTTP through the proxy, and MiroFish's own port is never published.

## Run it

### 1. Self-host with Docker

You need Docker with Compose v2.20 or later, an API key for any OpenAI-compatible LLM provider, and a [Zep Cloud](https://www.getzep.com/) API key (MiroFish stores its knowledge graph there).

```sh
git clone https://github.com/XenetDev/xenet-opinions.git
cd xenet-opinions
cp .env.selfhost.example .env.selfhost
sed -i.bak -e "s|^BETTER_AUTH_SECRET=$|BETTER_AUTH_SECRET=$(openssl rand -base64 32)|" -e "s|^MIROFISH_TOKEN=$|MIROFISH_TOKEN=$(openssl rand -hex 32)|" -e "s|^POSTGRES_PASSWORD=$|POSTGRES_PASSWORD=$(openssl rand -hex 32)|" -e "s|^MINIO_ROOT_PASSWORD=$|MINIO_ROOT_PASSWORD=$(openssl rand -hex 24)|" .env.selfhost && rm .env.selfhost.bak
```

The `sed` line fills in the four generated secrets. Now open `.env.selfhost`, set `LLM_API_KEY` and `ZEP_API_KEY` (and `LLM_BASE_URL` and `LLM_MODEL_NAME` if your provider is not OpenAI), then start the stack:

```sh
infra/docker/up.sh
```

Open http://localhost:3000 (or the `XO_WEB_PORT` set in `.env.selfhost`), attach a `.txt`, `.md` or `.pdf` (a run needs at least one file), ask a question and pick a number of rounds. `infra/docker/up.sh ps` shows the services; `web` turns healthy once `/api/health` answers. Images that are not available from `ghcr.io/xenetdev/xenet-opinions-*` are built locally on first start: compose first prints a `not found` pull error for each of them, then builds it. The MiroFish image takes several minutes. A 1-round run on a 1 KB seed file took about 6 minutes with `gpt-4o-mini` (more rounds, agents or a slower model take longer) and spends LLM and Zep credits, so start with one round. If you checked out a release tag, set `XO_IMAGE_TAG` to the same tag so the images match the code; `edge` follows `main`.

To try the bundle without any keys, run `infra/docker/up-mock.sh` instead; it swaps MiroFish for the bundled mock. Images, the environment reference, volumes, backups and updates are in [docs/hosting.md](docs/hosting.md).

### 2. Develop locally

No keys needed: the app runs against a mock MiroFish. You need Node 24, Docker (for Postgres) and pnpm 10.30 via corepack.

```sh
git clone https://github.com/XenetDev/xenet-opinions.git
cd xenet-opinions
corepack enable
pnpm install
cp .env.example .env
sed -i.bak "s|^BETTER_AUTH_SECRET=$|BETTER_AUTH_SECRET=$(openssl rand -base64 32)|" .env && rm .env.bak
docker compose --env-file .env -f infra/docker/docker-compose.dev.yml up -d
pnpm --filter @xo/db db:migrate
```

Then start the mock and the app in two terminals:

```sh
pnpm mock   # terminal 1: mock MiroFish on :5001
pnpm dev    # terminal 2: web on :3000 and the worker
```

If `corepack enable` fails with a permission error (Node installed system-wide), run `sudo corepack enable`, or skip it when `pnpm --version` already prints 10.30 or later. Open http://localhost:3000, attach a `.txt`, `.md` or `.pdf`, ask a question and pick a number of rounds. If port 5432 is taken, set `XO_PG_PORT` in `.env` and use the same port in `DATABASE_URL` before starting Postgres. Tests, lint and the mock's switches are described in [CONTRIBUTING.md](CONTRIBUTING.md).

### 3. Hosted demo

The hosted shape puts the web app on Vercel and the worker, token proxy and MiroFish on a container host, with managed Postgres and an S3-compatible bucket. [docs/hosting.md](docs/hosting.md) describes the topology, demo quotas and the kill switch; [docs/hosting-runbook.md](docs/hosting-runbook.md) is the step-by-step deployment.

## Licence

This repository is MIT licensed (see [LICENSE](LICENSE)). Third-party components vendored into the web app are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

MiroFish is AGPL-3.0. It runs unmodified as a separate service and this code only talks to it over HTTP; it never imports, vendors or patches MiroFish code. The published image `ghcr.io/xenetdev/xenet-opinions-mirofish` is the upstream MiroFish backend, unmodified, at the commit pinned in [infra/mirofish/Dockerfile](infra/mirofish/Dockerfile), and carries OCI labels pointing at that source and revision. Details are in [infra/mirofish/README.md](infra/mirofish/README.md).

## Documentation

- [docs/hosting.md](docs/hosting.md): self-hosting with Docker and the hosted topology
- [docs/hosting-runbook.md](docs/hosting-runbook.md): deploying the hosted demo
- [infra/mirofish/README.md](infra/mirofish/README.md): the MiroFish image, token proxy and retention
- [CONTRIBUTING.md](CONTRIBUTING.md): development setup, checks and pull requests
- [SECURITY.md](SECURITY.md): reporting vulnerabilities
- [Design spec](docs/superpowers/specs/2026-10-19-xenet-opinions-design.md)
