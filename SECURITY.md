# Security

## Reporting a vulnerability

Report vulnerabilities privately through GitHub's private vulnerability reporting: https://github.com/XenetDev/xenet-opinions/security/advisories/new

Please do not open a public issue, pull request or discussion for a security problem. Include what you found, how to reproduce it, the version or commit, and the impact you expect. If you are unsure whether something is in scope, report it anyway.

## Scope

In scope:

- The code in this repository (`apps/`, `packages/`, `scripts/`).
- The Docker Compose bundle in `infra/docker` and the MiroFish token proxy in `infra/mirofish`.
- The published images `ghcr.io/xenetdev/xenet-opinions-web`, `ghcr.io/xenetdev/xenet-opinions-worker` and `ghcr.io/xenetdev/xenet-opinions-mirofish` (for the last one, how we build and configure it).

Out of scope: vulnerabilities in MiroFish itself, which runs unmodified from upstream (report those to [666ghj/MiroFish](https://github.com/666ghj/MiroFish)); third-party services such as your LLM provider, Zep Cloud, Vercel or your container host; and deployments that ignore the points below.

## Security model

- **The proxy token is the only authentication to MiroFish.** MiroFish has no authentication of its own. The Caddy proxy in `infra/mirofish` rejects every request without the right `X-MiroFish-Token` except `GET /health`. MiroFish's port must never be exposed directly, on the public internet or to any network you do not control; only the proxy may reach it. When the proxy is reachable over a network, put TLS in front of it, or the token travels in cleartext. Use a long random token (`openssl rand -hex 32`) and rotate it if it leaks.
- **MiroFish error bodies are untrusted.** Upstream error responses can contain tracebacks, file paths and other internal details, and their content is controlled by whatever MiroFish received. The app treats them as untrusted input: tracebacks are never shown, and a failed run shows at most the first line of the error message, capped at 300 characters, as plain text. A way to get more than that in front of a user, or to inject markup through it, is a vulnerability.
- **Anonymous sessions and the demo quota are not an abuse control.** Users get anonymous sessions, and `DEMO_MODE`'s per-user quota is per session, so anyone can start a new session to get a fresh quota. Every run spends LLM and Zep credits. If you expose an instance publicly, set provider-side spend limits, keep `DEMO_PAUSED` ready as a kill switch, and put your own access control in front if you need it.
- Secrets (`BETTER_AUTH_SECRET`, `MIROFISH_TOKEN`, database and storage credentials, LLM and Zep keys) live only in environment files that are not committed.

## What to expect

This is a small, volunteer-maintained project. We aim to acknowledge a report within 7 days and to agree on a fix and disclosure timeline with you after triage. Fixes ship in a new release and are published as a GitHub security advisory, crediting you unless you ask otherwise.

There is no bug bounty.
