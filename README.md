# Xenet Opinions

Xenet Opinions is an open-source, chat-first interface for running MiroFish simulations and reading the resulting opinions. A pipeline timeline in the chat shows each stage of a run as it streams in. Phase 0 ships the scaffold with an echo backend; the MiroFish integration is Phase 1.

## Quickstart

Requires Node 24, pnpm 10 and Docker.

```sh
cp .env.example .env
openssl rand -base64 32   # paste into BETTER_AUTH_SECRET in .env
docker compose --env-file .env -f infra/docker/docker-compose.dev.yml up -d
ln -s ../../.env apps/web/.env
pnpm install
pnpm --filter @xo/db db:migrate
pnpm dev
```

Then open http://localhost:3000.

If port 5432 is already taken, set `XO_PG_PORT` in `.env` and use the same port in `DATABASE_URL` before starting the database. Start it with the `--env-file .env` command above so Compose reads the override.

Other commands: `pnpm typecheck`, `pnpm test`, `pnpm build`.

## Repository layout

- `apps/web`: Next.js 16 app with anonymous Better Auth sessions, the chat page and the stage timeline.
- `packages/config`: shared TypeScript and Vitest base configuration.
- `packages/db`: Drizzle schema, migrations and Postgres client.
- `packages/mirofish`: typed HTTP client for the MiroFish API.
- `packages/engine`: pipeline stage types shared by the server and the UI.
- `infra/docker`: Compose file for the local Postgres 18 database.
- `docs/superpowers`: design spec and implementation plans.

## License

This repository is MIT licensed. Third-party components vendored into the web app are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). MiroFish (https://github.com/666ghj/MiroFish) is AGPL-3.0. This UI only talks to MiroFish over HTTP and never imports or vendors its code, so the AGPL does not apply here. Phase 0 ships an echo backend; the MiroFish integration is Phase 1. Any patches to MiroFish live in a separate AGPL fork.

## Documents

- Design spec: [docs/superpowers/specs/2026-10-19-xenet-opinions-design.md](docs/superpowers/specs/2026-10-19-xenet-opinions-design.md)
- Phase 0 plan: [docs/superpowers/plans/2026-10-19-phase-0-scaffold.md](docs/superpowers/plans/2026-10-19-phase-0-scaffold.md)
