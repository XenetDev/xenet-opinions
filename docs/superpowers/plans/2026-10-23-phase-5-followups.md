# Phase 5 follow-ups (deferred from per-task and final review, 2026-10-23)

Source: SDD ledger for docs/superpowers/plans/2026-10-23-phase-5-oss-release.md. Everything below is open at launch, Phase 6 or dropped-with-reason.

## Open at launch
- Real-key MiroFish run not performed: no LLM or Zep keys were available, so Task 7 was deferred and the clean-machine check ran on the mock bundle (`infra/docker/up-mock.sh`). Without keys, `up.sh` was checked only up to the blank-key refusal (`set ZEP_API_KEY in .env.selfhost`, exit 1). The first keyed run must confirm `/health` through the proxy and one 1-round run end to end, and may reveal mock/real mismatches.
- GHCR images are not published yet: `ghcr.io/jdships/xenet-opinions-{web,worker,mirofish}` return `not found`, so every install builds locally. After the first release workflow run, make the three packages public on GitHub.
- GitHub Actions billing: CI, the release workflow and GHCR publishing have not run. Push the first `v0.1.0` tag only after a green run on `main`.

## Phase 6 / post-launch notes
- The quota check is not atomic with `startRun`, so concurrent sends from one user can exceed `MAX_RUNS_PER_DAY` by one.
- Chat delete does not close the simulation env (carried from Phase 3).
- Railway legacy IPv6-only private networking needs `FLASK_HOST=::` on `mirofish`.
- A `running` run with an expired lease briefly counts as ahead in the queue position.
- Retries are free under the quota with no cap of their own. Decision recorded: the kill switch (`DEMO_PAUSED=1`) now refuses retries with `demo_paused`; the quota still exempts them.
- The landing page's example questions start a run with no attachment, which fails at once with `at least one file is required` (seen in the clean-machine run).

## Deferred minors (per-task reviewers; final triage done)
- Task 1: minor (deferred): `up.sh up -d web` on a fresh host with no published image fails (migrate has no build:); compose.test.sh now clears COMPOSE_FILE/COMPOSE_PROJECT_NAME too
- Task 2: minor (deferred): health probe bodies not cancelled (resolved in the final fix wave); pause test doesn't assert getActiveByChat untouched; compose web runtime NEXT_PUBLIC_APP_URL default (resolved in Task 6); hosting-runbook.md "inlined at build time" (resolved in Task 6); ci.yml build arg now optional (harmless)
- Task 3: minor (deferred): lint-fix commit carries ~200 lines of chain reflow (format pass not idempotent on first run); sharp libvips allowlist incomplete for arm/ppc64/s390x/riscv64/win32-arm64/ia32/wasm32 → carried to Task 6; exceptions match by name not version; fast CI checks after DB tests → carried to Task 4; noNonNullAssertion rationale only in report; no parser test for nesting/WITH; role=img a11y change inside lint commit
- Task 4: minor (deferred): index-level annotations on multi-platform manifests; Dependabot docker matching of Dockerfile.* uncertain (verify after first run); web image bakes localhost NEXT_PUBLIC_APP_URL (moot after Task 2 same-origin)
- Task 5: minor (deferred): badge minute countdown pushes an active error notice out of the shared region; load-time announcement of "Agents offline"; collapsed workbench state has no axe test; test formatting (missing blank lines); pre-existing Vite configLoader warning in test output
- Task 6: minor (deferred): README presents real runs as verified pending Task 7
- Task 8: minor (deferred): README "a run needs at least one file" implies a pre-send check (actually fails at ontology, observed on mock only); followups wording "With keys" (resolved in the final fix wave); human-steps timing is an estimate; screenshot gitignored (fine)

### Final review minors (deferred)
- `NEXT_PUBLIC_APP_URL` is validated by the schema and set in the image and docs but no longer read by the app after the same-origin change; remove it, or document that `BETTER_AUTH_URL` is the one that matters.
- The "Compose v2.20 or later" floor was tested only on Compose v5.0.2; nested defaults and the pull-then-build fallback are the behaviours to verify on the floor.
- Final review triage: two items were already fixed in Task 6, two were fixed in the final fix wave, the rest stay deferred; none block merge. Before the first release tag: run the real-key MiroFish run (Task 7), make the three GHCR packages public, and verify the MiroFish image labels.
