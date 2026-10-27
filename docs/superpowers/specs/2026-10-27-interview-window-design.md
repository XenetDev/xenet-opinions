# Interview window before the report — design

Addendum to `docs/superpowers/specs/2026-10-19-xenet-opinions-design.md` (Phase 3 follow-ups/interviews) after the first real-MiroFish run on 2026-10-27 (`docs/superpowers/plans/2026-10-23-phase-5-followups.md`, "Real MiroFish findings").

## Intent

Interviewing individual personas is a must-have. Upstream MiroFish only writes the report after the simulation process has exited, and personas exist only while that process runs, so "report first, then interview" is impossible without an upstream change. The product therefore offers an optional pause between the simulation rounds and the report: personas stay online for a bounded window, the user interviews them, and the report is generated when they ask for it or when the window ends. A run always ends with a report.

Decisions by the owner (2026-10-27): the pause is **opt-in** via a checkbox at run start ("Pause for interviews before the report"); unchecked runs go straight to the report exactly as today.

## Goals

- A run started with the checkbox ticked stops after the rounds with the personas online, shows how long they stay online, lets the user interview up to 5 personas per question with answers arriving one by one, and generates the report on "Generate report" or when the window expires.
- Interviews execute in the worker, not the web request, so they survive reloads, tab switches, the stream cap and Vercel's request limit; each answer streams into the chat as it arrives.
- The pause never leaks an environment: the window is 20 minutes, extended 10 minutes per interview, capped at 60 minutes from the pause start; expiry, "Generate report", cancel and chat delete all close the environment.
- Runs started without the checkbox are unchanged in behaviour, timing and UI.
- The feature is verified end to end against real MiroFish with keys before merge.

## Non-goals

- Interviews after the report. The post-run "Agents available for N min" badge and the post-run interview option are removed from the UI; report follow-ups after the run stay.
- Changing MiroFish. An upstream issue is filed asking to allow report generation while the runner waits for commands; if accepted, a later phase can restore post-report interviews.
- Per-persona platform selection. Interviews use MiroFish's default platform for the simulation; `platform` is not sent.
- Stage deadlines for the other polling stages (recorded follow-up).

## Anti-goals

- A user who did not tick the box must never see a pause, a countdown, or any interview UI during a run.
- A ticked run must never wait forever: no state in which the environment is open and nothing will close it.
- No second streaming or persistence path for interview answers; they ride the existing run-events log.

## Decisions

- **Run option.** `runOptions.pauseForInterviews: boolean` (default `false`) in the message body schema; stored in `runs.config.pauseForInterviews`. The composer shows a checkbox "Pause for interviews before the report" next to the rounds selector in run mode only. The demo policy may force it off (`DEMO_ALLOW_PAUSE`, default `'1'`); when forced off the checkbox is hidden.
- **New stage `interviews`** between `sim_run` and `report` in `STAGES`. `sim_run` advances to `interviews` (without closing the environment) when `config.pauseForInterviews` is true and both platforms are complete; otherwise it keeps today's behaviour (close-env, wait for `completed`, advance to `report`). The shared "close environment and wait through `stopping` to `completed`" logic becomes one helper used by both stages.
- **Stage `interviews` semantics.** `enter`: emit `stage { interviews, running, "Personas online" }`, set `cursors.interviewsStartedAt = now`, `envState = 'open'`, `envKeepaliveUntil = now + ENV_KEEPALIVE_MS`, and emit a `data-interview_window` part `{ until: ISO, personaCount }`. `poll` (every tick): (1) if a pending interview row exists for this run, execute it (below); (2) else if `cursors.reportRequested === true` or `envKeepaliveUntil <= now`, run the close-and-wait helper, emit `stage { interviews, done }` and `data-interview_window { until: null, closed: true }`, advance to `report`; (3) else idle (no MiroFish call). The sweeper only targets runs with `status = 'done'` (it must not close a paused run's environment; expiry is handled by the stage).
- **Interview requests during the window.** `POST /api/chats/:id/messages` with `target: 'agents'` while the chat's active run is in stage `interviews` (checked before the `run_active` 409): validate `agentIds` against the run's `data-agents` roster (1..5, no duplicates, as today); insert the user message row; insert one `interviews` row per persona with `status: 'pending'`, a shared `question_id` (new column), `run_id`, `message_id` = the run's assistant message id; append events `interview { id: <row id>, questionId, agentId, agentName, question, status: 'pending' }` with partId `interview:<row id>`; extend `envKeepaliveUntil` (same formula as Phase 3, cap from `interviewsStartedAt`); return the usual run tail stream for the active run (so the client reattaches to the run turn, where the cards live). No assistant message row is created for interview turns; answers render inside the run's assistant turn.
- **Execution in the worker.** For each pending row in question order then persona order: `interviewBatch({ simulationId, interviews: [{ agentId, prompt }], timeout: 170 })` (client timeout 200 s; the `timeout` field is new on the client), then update the row (`done` + answer, or `failed` + short error) and append `interview { ...status:'done'|'failed' }` for the same partId. One persona per MiroFish call; a worker restart retries the persona it was on. `MiroFishError` codes map to the Phase 3 failure strings.
- **Generate report.** `POST /api/chats/:id/run/report` (auth + ownership; 409 `run_not_paused` unless the active run is in stage `interviews`) sets `cursors.reportRequested = true` (unfenced update) and returns 202. The client shows a "Generating report" state until the stage changes. If pending interviews exist, they finish first (bounded by their count × 200 s), then the report starts.
- **Client.** New parts: `data-interview_window` renders an `InterviewWindowCard` in the run turn: "N personas are online until HH:MM", a countdown fed by `/run`'s `envKeepaliveUntil`, the **Generate report** button, and a hint to pick personas from the roster. `data-interview` parts render grouped by `questionId` under the card (question text as a heading, one card per persona, pending shimmer → answer/failed). While the run is in stage `interviews` the composer is in `interview` mode: target fixed to personas, roster selectable (existing `InterviewSelectionProvider`), chips, no attach/rounds; sending with no chips is refused as today. Pipeline timeline gets a row for `interviews` ("Personas online"; done when the report starts); it is absent for runs without the pause.
- **Post-run cleanup.** On `done`, `envState = 'closed'` and no keepalive (the Phase 3 post-run window is removed). `EnvBadge` and the post-run "Interview personas" target go away; `env_closed` handling stays for safety. Follow-ups to the report work as before.
- **Cancel / delete.** Cancel during `interviews` closes the environment (the worker's cancel cleanup covers the new stage); delete cascades `interviews` rows and cancels first, as today.
- **Hosted demo.** Interviews count LLM spend but not run quota; `MAX_INTERVIEW_AGENTS` stays 5; `DEMO_ALLOW_PAUSE=0` hides the feature if cost becomes a problem.
- **Mock.** The mock keeps its current post-rounds behaviour (wait mode, interviews answered while open, 409 on report until close-env) and gains a per-call delay for interviews so the trickle is visible in the UI (`MOCK_INTERVIEW_DELAY_MS`, default 1500).
- **Worker slot.** `MAX_CONCURRENT_RUNS` stays 1 (two OASIS processes in one MiroFish are unproven) and a paused run holds the slot for its window. The queue card says so ("A run is paused for interviews; yours starts when it finishes, at most N min"). The hosted demo ships `DEMO_ALLOW_PAUSE=0` until concurrency above 1 is proven; self-hosters get the feature by default.
- **Timeouts and platform, from the real measurements** (about 3 minutes per persona per platform; both platforms without `platform` exceeded MiroFish's 120 s default). Interviews are sent one persona per call with `platform` set to the simulation's default platform (recorded on the `agents` part at prepare time from the simulation config) and MiroFish `timeout: 240`; the client timeout is 270 s. Because the worker runs them, Vercel's limit does not apply. Each accepted question extends the window by 5 minutes per persona (cap 60 from the pause start).
- **The cap bounds new work, not in-flight work.** Expiry or the cap refuses new questions at the route (`409 window_closed`); "Generate report" refuses new questions (`409 report_requested`); pending personas always complete (bounded by their count × 270 s) before the environment closes. That is the "never waits forever" guarantee.
- **The question is not a user message.** Interview questions are recorded only on the `interviews` rows and shown as headings inside the run turn's interview block; no `messages` row is written, nothing enters report follow-up history, and the client sends a plain POST then reattaches to the run stream (`resumeStream`), never `useChat.sendMessage`.
- **Dead or stuck environments.** (1) The idle `interviews` poll checks `run-status` every 30 s; if the runner is no longer `running`, the window ends early (`data-interview_window { closed: true, reason: 'environment_stopped' }`), pending rows are failed with `Agents are offline`, and the run advances to `report`. (2) The close-and-wait helper has a 3-minute deadline; on timeout the run fails with code `env_stuck`. (3) `fail()` for stages `sim_run | interviews | report` triggers the same best-effort stop/close-env cleanup the cancel path uses, so a failed paused run never leaks an environment. (4) Retry of a run that failed in `interviews` re-enters at `report` (the environment cannot be revived); retry of `env_stuck` likewise.
- **Verification.** Mock path in CI/e2e; then one real-key run with the box ticked: two interviews (one persona, then two personas), Generate report, report follow-up; plus one real run with the box unticked to confirm unchanged timing. Screenshots in `.context/`.

## Constraints

- MIT clean-room; HTTP only to MiroFish; engine pure TS; `@xo/engine/parts` Postgres-free.
- Backward compatibility: existing runs (no `pauseForInterviews`) and existing rows load and replay unchanged; migration adds only `interviews.question_id` (nullable) and nothing destructive.
- All existing tests keep passing; new behaviour covered by engine machine tests, store tests, route tests, component tests, mock tests, worker e2e against the mock.
- Keys live only in the local `.env.selfhost`; never in commits or reports.

## Left to the builder

- Exact countdown rendering and the copy on the window card.
- Whether `data-interview_window` is one part updated in place (preferred) or two.
- Test fixture shapes for the new event kinds.
- How the composer's interview mode is derived (from `/run`'s `stage` or from the presence of an open window part).
