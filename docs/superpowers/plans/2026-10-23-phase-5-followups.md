# Phase 5 follow-ups (deferred from per-task and final review, 2026-10-23)

Source: SDD ledger for docs/superpowers/plans/2026-10-23-phase-5-oss-release.md. Everything below is open at launch, Phase 6 or dropped-with-reason.

## Open at launch
- ~~Real-key MiroFish run not performed~~ Resolved 2026-10-27 by Task 7: one 1-round run reached Done through the real compose path after four client fixes; see "Real MiroFish findings (2026-10-27)" below.
- GHCR images are not published yet: `ghcr.io/xenetdev/xenet-opinions-{web,worker,mirofish}` return `not found`, so every install builds locally (since then published as private packages; the Task 7 run pulled all three). After the first release workflow run, make the three packages public on GitHub.
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
1. `POST /api/simulation/prepare/status` with `simulation_id` returns, once preparation is done, `{simulation_id, status: "ready", progress: 100, already_prepared: true, message, prepare_info}` with no `task_id` (and `status: "not_started"` before a task exists). Our `PrepareStatus` (a `Task`) required `task_id`, so the first run failed at sim_prepare with a schema error. `PrepareStatus` now allows both shapes and sim_prepare treats `status: "ready"` as prepared; the mock returns the ready shape; fixture `simulation.prepare-status.ready.json`.
2. After the last round, MiroFish does not report `completed`: the simulation process enters wait-for-commands mode (so interviews can run) and `run-status` stays `runner_status: "running"` with `twitter_completed` and `reddit_completed` true, indefinitely. Our sim_run waited for `completed`/`stopped` and hung. Right after `start`, run-status is already `running` (current_round 0), never `idle`; before start it is `idle` with `total_rounds: 0`.
3. `POST /api/report/generate` returns 409 `{"success":false,"error":"Simulation or Zep graph ingestion is still active; wait for a terminal run status before generating a report","ingestion_pending":true}` until the runner reaches `completed`/`stopped` and the Zep updater has drained. The runner only gets there when the process exits (close-env or stop). sim_run now calls `close-env` once when both platforms are complete, waits through `stopping` (Zep drain, about 15 s) to `completed`, then advances; the report stage also waits (does not fail) if `report/generate` still answers that 409; the mock mirrors the 409 and the close-env transition.
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
- ~~Persona interviews are not usable after any run.~~ Resolved 2026-10-27 by the interview window (`docs/superpowers/specs/2026-10-27-interview-window-design.md`): an opt-in pause between the simulation rounds and the report keeps the personas online, the post-run interview option and badge are removed, and report follow-ups still work after the run.
- ~~Interview request gap (`platform` and `timeout` not sent).~~ Resolved by the same feature: interviews go out one persona per call with the simulation's platform and a MiroFish-side `timeout`.
- Still open: ask upstream MiroFish to allow report generation while the runner waits for commands, which would restore post-report interviews. Upstream issue: <link to be added once filed>.
- sim_run (and other polling stages) have no wall-clock deadline; a MiroFish restart mid-run hangs the run until the user cancels. sim_prepare likewise keeps polling with no deadline if MiroFish answers `status: "not_started"` while we hold a `prepareTaskId` (for example after its task store is lost).
- During this task a compose `up` against this worktree recreated `mirofish`, `worker` and `migrate` at 09:54:52Z from a locally built MiroFish image (built 09:53:45Z) that this session did not start; the stacks share the `xenet-opinions` project name, so concurrent sessions can disturb each other.


## Interview window verification (2026-10-27)

Branch `feat/interview-window`, images built locally (`up-mock.sh up -d --build`, then `up.sh up -d --build`), 1.2 KB e-scooter-ban seed, `gpt-4o-mini`.

### Mock stack (`MOCK_SPEED=20`, `MOCK_INTERVIEW_DELAY_MS=3000`)
- Ticked run: window card "12 personas are online until HH:MM", minute countdown, Generate report and Cancel run; composer switches to "Interview personas". One persona answered 4.3 s after the question (3 s mock delay plus the 2 s poll); two personas trickled at +3.0 s and +8.0 s. Each question extends the window by 5 minutes per persona, capped at 60 minutes from the pause (seen: 12:30 -> 12:35 -> 12:45 -> 12:50 -> 13:10 cap).
- Reload mid-window, with answers pending, restored the card, countdown, question groups (pending cards "Thinking…") and composer mode (RF5).
- Generate report: card "Generating report…", window closed `report_requested`, report, done; then `env_state closed`, no sidebar badge, composer "Ask the report", report follow-up answered.
- Unticked run: no `interviews` stage, no `interview_window` or `interview` events, no card; same stage sequence as before (RF1).
- RF2: keepalive set to `now()` with two answers pending; both arrived, then one `interview_window {closed, reason: expired}`; card "The interview window ended".
- RF4: Generate report with three personas pending; all three answers arrived, a new question was refused with "The report is being generated; no more interviews for this run.", then the report.
- RF3: env stopped through `POST /api/simulation/stop` (server up): detected within 20 s of the stop, card "Personas offline / The simulation environment stopped", no closeEnv, report generated. Mock container stopped with four questions pending: each call failed (HTTP 502) and the cards showed "Agents are offline"; detection 26 to 28 s after the stop. With the container down the report cannot be written (the mock is the whole MiroFish API and keeps simulations in memory): the report stage retried three times on 502 and, after a restart, failed with "simulation not found". Expected for the mock only.
- Cancel from the card: run `cancelled`, `env_state closed`, card "The run ended".

### Real MiroFish (`up.sh`)
- Ticked 1-round run: window open 4 min 13 s after submit (ontology 16 s, graph 43 s, personas 47 s, rounds 137 s).
- Interviews: one persona 4.9 s; two personas 2.2 s and 7.2 s after the question (one call each, `count=1, platform=reddit` in MiroFish's log, all 200, no 504). The running worker sends `timeout: 240` (`INTERVIEW_MIROFISH_TIMEOUT_S`; MiroFish does not log it). Answers are in Chinese, 170 to 300 characters.
- Generate report: `close-env` within 1 s, window closed 31 s later (close and wait), report 113 s; MiroFish's report agent again logged three "环境未运行" InterviewAgents warnings and completed. Follow-up to the report answered (`report/chat` 200).
- Call counts for the ticked run: `interview/batch` 3 (one per persona), `close-env` 1, `report/chat` 1.
- Unticked 1-round run: 3 min 59 s end to end (rounds 27 s, report 111 s), no interview calls, same stage sequence as before the feature.

### Findings
- Real interview latency is seconds, not minutes. The 6.5-minute figure above was measured on a stale environment from an earlier run. `docs/hosting.md` now gives the measured 2 to 5 s and the 240 s ceiling; the window card copy still says "answers take about 3 minutes per persona" (UI string, left for a follow-up), and the 5-minute extension per persona is generous for real latencies.
- Mock fidelity: the mock answers `interview/batch` after `stop` (it refuses only after `close-env`); real MiroFish cannot answer with a dead environment.
- Rows of one question share `created_at`, so their processing order is not the selection order (cosmetic).
- While paused, the timeline reads "Personas online / Running / Personas online" (step label and its detail line repeat).
- After a run fails, stale notices ("Something went wrong sending your message", "Select at least one persona to interview") stay under it.
- `docs/hosting.md` corrections: interview latency, and dead-environment detection is "within about 30 seconds of the last answer" (a question in flight is answered or fails first).

## Language (2026-10-27)

MiroFish picks its language from the `Accept-Language` header on each request and falls back to Chinese when the header is missing, so every earlier real run produced Chinese roles, posts, interview answers, report titles and progress messages. The client now sends `Accept-Language` on every call (`MIROFISH_LOCALE`, default `en`; `zh`, `es`, `fr`, `pt`, `ru`, `de` also accepted). Verified on a real ticked 1-round run with `gpt-4o-mini`: progress messages ("Zep processing... 3/3 done", "Generating Agent Profiles"), all 12 persona roles and bios, the simulation posts, a one-persona interview answer and the report title and body were English. Still Chinese: the headings inside the report agent's tool-result summaries ("深度采访报告", "广度搜索结果", "未来预测深度分析"), which are hardcoded in upstream `backend/app/services/zep_tools.py` and not localised; they show only inside the collapsible tool entries of the report workbench. Worth including in the upstream issue.

## ReUI chat verification (2026-10-28)

Branch `ui/reui-chat`, images built locally (`up-mock.sh up -d --build`, then `up.sh up -d --build`), 1.3 KB e-scooter-ban seed (council member, two operators, seniors' association, students' union), Chrome at 1456 px and 390 px wide. Screenshots: `.context/reui-home.jpg`, `reui-run.jpg`, `reui-window.jpg`, `reui-report.jpg`.

### Mock stack (`MOCK_SPEED=20`, `MOCK_INTERVIEW_DELAY_MS=3000`)
- Home: greeting, line, three starters, pill composer; Resume rail appears after the first chat. A starter fills the box and focuses it with no request. Attaching a `.txt`, 1 round and the pause item, then Send, landed on `/c/:id` with the console working (spinner, shimmer label, rows animating in, `Step n of 7`).
- Reload mid-run (report stage) and mid-window restored the live row, the Needs-you band with countdown and the interview composer.
- Window: "12 personas are online until HH:MM", minute countdown, Generate report and Cancel run. Two personas selected → chips above the pill; question → two persona turns with avatars, Thinking shimmer, both answers within 10 s. Generate report → band "Generating report…", then console folded ("Finished · 8 steps"), report text, follow-up answered.
- Unticked run: no interviews row, straight to the report (about 22 s at this speed). Cancel from the band → console "Cancelled", notice "Run cancelled". `/__mock/fail-stage sim_prepare` → failed row "Injected failure" with "Retry from here"; retry after clearing the flag started a new turn that completed.

### Real MiroFish (`up.sh`, `gpt-4o-mini`)
- Ticked 1-round run: ontology 14 s, graph 41 s (19 nodes, 23 edges), sim_create 2 s, personas 53 s, round 13 s; window open at 2 min 5 s. Two personas answered 1.3 s and 5.3 s after the question. Generate report at 4 min 8 s; report writing from 4 min 53 s; complete at 7 min 0 s. Report tool rows showed `insight_forge`, `panorama_search`, `interview_agents` (and `quick_search`) chips with spinners, then checks and clocks (0:01 to 0:10); sections showed their own clocks. Follow-up answered.

### Mobile (390 px) and console
- Home and a running chat: no horizontal overflow, the document fits the viewport, composer reachable. Desktop Chrome cannot show the collapsing URL bar, so the `h-svh` strip concern from Task 5 is unverified on a phone.
- Browser console: no React or hydration errors on home, a running chat, the window or the report (only a browser extension's "Receiving end does not exist"). The images are production builds, so development-only React warnings are not visible there; the web test run prints none.

### Defects fixed
- Between stages the band showed a static dashed ring (no motion) on the next step; it now spins while the run is live (`5106435`).
- "Generating report…" was plain text for the 30 to 45 s close-and-wait; it now has a spinner and shimmer (`5106435`).
- Console title cut mid-word at 60 characters with no ellipsis (`4668b73`).
- Report markdown lists had no bullets and paragraphs no spacing: streamdown's classes were never generated; `@source` added in `globals.css` (`9dae4f9`).
- At 390 px the starters truncated and the composer placeholder wrapped to two lines, swelling the pill (`2b8ee43`).
- Live row repeated its title as the detail line ("Writing the report / Writing the report") (`353248c`).
- During the report the live line showed the latest raw tool result (Chinese markdown, cut off); it now shows the latest step (`1a7a406`).

### Left
- The spec says the report should be the first thing on screen once it arrives; the console folds, but the plan's body order (console, ontology, graph, roster, feed, interviews, text) keeps the report below the graph, roster, feed and interviews. Needs a decision on moving text up under the folded console.
- Between the last round and the interviews stage the spinner sits for about 2 s on "Writing the report", because the interviews row exists only once its stage part arrives.
- Resume rows and stored chat titles are cut at 60 characters without an ellipsis (server title).
- The footer has no run clock (Task 1 ruling).
- After reload, the first click on a roster card sometimes hit the feed because the thread was still settling its scroll position (seen once, not reproduced).
