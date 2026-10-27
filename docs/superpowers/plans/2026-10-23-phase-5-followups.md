# Phase 5 follow-ups (deferred from per-task and final review, 2026-10-23)

Source: SDD ledger for docs/superpowers/plans/2026-10-23-phase-5-oss-release.md. Everything below is open at launch, Phase 6 or dropped-with-reason.

## Open at launch
- ~~Real-key MiroFish run not performed~~ Resolved 2026-10-27 by Task 7: one 1-round run reached Done through the real compose path after four client fixes; see "Real MiroFish findings (2026-10-27)" below.
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

## Real MiroFish findings (2026-10-27)

First run against upstream MiroFish (`ghcr.io/xenetdev/xenet-opinions-mirofish:edge`, pulled from GHCR) with `gpt-4o-mini` and Zep Cloud, local Docker on macOS arm64. Seed: a 1.2 KB `.txt` news item; question about a downtown e-scooter ban; 1 round; driven through the browser UI.

### Timings
- Image pull of all three images: about 6 minutes (MiroFish image 3.9 GB). MiroFish cold start: about 2 s from container start to Flask serving.
- Successful run (run b0386b6b, retried from the report stage as 5682435e): ontology 17 s, graph_build 63 s (19 nodes, 22 edges), sim_create 2 s, sim_prepare 46 s (9 personas), sim_run 81 s (rounds about 35 s, then close-env and Zep drain about 15 s), report about 2 min 10 s (3 sections). About 6 minutes end to end without the failures. Report follow-up: 2 to 4 s.
- README, hosting.md and hosting-runbook.md said "20 to 60 minutes"; corrected to the measured figure.

### Where the mock had guessed wrong (fixed in our code, with tests)
1. `POST /api/simulation/prepare/status` with `simulation_id` returns, once preparation is done, `{simulation_id, status: "ready", progress: 100, already_prepared: true, message, prepare_info}` with no `task_id` (and `status: "not_started"` before a task exists). Our `PrepareStatus` (a `Task`) required `task_id`, so the first run failed at sim_prepare with a schema error. `PrepareStatus` now allows both shapes; the mock returns the ready shape; fixture `simulation.prepare-status.ready.json`.
2. After the last round, MiroFish does not report `completed`: the simulation process enters wait-for-commands mode (so interviews can run) and `run-status` stays `runner_status: "running"` with `twitter_completed` and `reddit_completed` true, indefinitely. Our sim_run waited for `completed`/`stopped` and hung. Right after `start`, run-status is already `running` (current_round 0), never `idle`; before start it is `idle` with `total_rounds: 0`.
3. `POST /api/report/generate` returns 409 `{"success":false,"error":"Simulation or Zep graph ingestion is still active; wait for a terminal run status before generating a report","ingestion_pending":true}` until the runner reaches `completed`/`stopped` and the Zep updater has drained. The runner only gets there when the process exits (close-env or stop). sim_run now calls `close-env` once when both platforms are complete, waits through `stopping` (Zep drain, about 15 s) to `completed`, then advances; the mock mirrors the 409 and the close-env transition.
4. Report agent-log lines carry `section_title: null` and `section_index: null` (report_start, planning lines). `AgentLogLine` now accepts null; the curated Phase 0 log is kept as `report.agent-log.mock.json` for the mock and mapping tests, and `report.agent-log.json` is the real capture.

### Other observed behaviour
- Interview batch (real, `simulation.interview-batch.json`): `data = {success, interviews_count, result: {interviews_count, results: {"twitter_0": {agent_id, platform, response, timestamp}, ...}}, timestamp}`; `results` is an object keyed `<platform>_<agent_id>`, one entry per platform when no `platform` is sent. `interviewsToParts` and the mock now use this shape (first answer per agent wins). Captured on a still-open env from an earlier run; 2 agents on `platform: "twitter"` took about 6.5 minutes. The same call without `platform` hit MiroFish's 120 s default and returned 504 `{"error":"等待批量Interview响应超时: 等待命令响应超时 (120秒)","success":false}`.
- Closed env: MiroFish answers `interview/batch` with 400 `{"success":false,"error":"模拟环境未运行或已关闭。请确保模拟已完成并进入等待命令模式。"}`; our web turns that into interview cards with "Agents are offline". After the sweeper marks the run closed, the web app answers 409 `{"error":"env_closed"}` without calling MiroFish. `close-env` on a closed env is 200 `{"message":"环境已经关闭","success":true}`; `stop` on a completed run is 400 `模拟未在运行: <id>, status=RunnerStatus.COMPLETED` (the sweeper ignores it).
- Report follow-ups work after close-env (`report/chat` 200; response `{response, sources: [], tool_calls: []}`).
- `/health` through the proxy: 200 `{"service":"MiroFish Backend","status":"ok"}` (also served without the token, by design of the Caddyfile).
- No MiroFish 500s were seen; no `runs.error` or UI notice contained a traceback (errors were short `code`/`message` pairs).
- Posts survive a MiroFish container restart (SQLite on the uploads volume), but a restart during a run leaves `run-status` at `stopping` for good, and sim_run has no deadline, so the run hangs until cancelled.
- MiroFish's own report agent tries `InterviewAgents` while writing the report and logs "环境未运行" because the env is already closed; the report still completes.
- Content language: posts, report and follow-up answers come out in Chinese for an English seed and question.
- The documented capture command needs `exec -u root` in the worker container: `/app/packages/mirofish/src/fixtures` is root-owned and the worker runs as `node`.

### Open (needs a decision)
- Persona interviews are not usable after a real run: the report needs the env shut down and interviews need it running. The run still ends with `envState: 'open'` and the UI says "Agents available for 20 min" until the first interview fails. Options: mark the env closed at Done and hide interviews for real runs; offer interviews before the report; or ask upstream for a report that does not require a terminal run.
- sim_run (and other polling stages) have no wall-clock deadline; a MiroFish restart mid-run hangs the run until the user cancels.
- During this task a compose `up` against this worktree recreated `mirofish`, `worker` and `migrate` at 09:54:52Z from a locally built MiroFish image (built 09:53:45Z) that this session did not start; the stacks share the `xenet-opinions` project name, so concurrent sessions can disturb each other.

