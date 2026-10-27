# Interview window follow-ups (2026-10-27)

Deferred findings from the task reviews and the whole-branch review of `feat/interview-window`. None blocks the merge; each is small and independent.

## Engine and worker

- `cancelRun` settles interview rows unfenced and lists pending rows before its transition without re-listing after; the web guard closes the other side of the race, so a lost update needs a cancel and a question in the same instant.
- The worker still polls pending rows while `reportRequested` is set, so the web route's fail-marking on a guard failure can overwrite a `done` row without an event (the UI stays correct because the event was already emitted).
- The report route's guard checks the stage, not the status, so a just-cancelled run gets a 202 and a harmless `reportRequested` cursor.
- `sim-prepare` always re-emits the `agents` part; unticked runs make one `configRealtime` call and one extra cursor write they did not before.
- The interview event is emitted before the row update, so a crash between the two re-interviews the persona on retry.
- Rows of one question share `created_at`, so `listPendingInterviews` processes them in id order, not selection order. Generate ids in selection order or add a position column.
- The env check in `stages/interviews.ts` and `extendInterviewWindow` depend on `interviewsStartedAt`; `interviews.enter` re-reads all events to find the platform although `sim-prepare` just computed it. Store the cursor at prepare time.
- `InterviewPatch.status` is typed `string`; use the status union.
- `machine.test.ts` is close to 1000 lines; move the `interview window` describe to `stages/interviews.test.ts`. The RF3 machine test reaches its race through a `listPendingInterviews` spy.
- Drizzle `hasPausedRunning` has no false-case test.
- After `fail()` stops and closes the env during `sim_run`, retry re-enters `sim_run` and calls `start` on a closed env. Whether real MiroFish restarts cleanly is untested.
- Dead in practice: the post-run `agents` branch in `apps/web/src/server/follow-up.ts`, `extendKeepalive`, `ENV_INTERVIEW_EXTEND_MS` and `ENV_KEEPALIVE_CAP_MS`. Done runs are always `closed` now. Remove them together, and either drop or restore the `env_closed` client notice.

## Mock

- `interview/batch` answers after `stop`; real MiroFish cannot. Refuse once the runner is `stopped` so the RF3 pending-fail path is testable on the mock without stopping the container.
- `MOCK_INTERVIEW_DELAY_MS` is not scaled by `MOCK_SPEED`.
- `platform: null` returns 400; `mock.bodies` records `{}` for GETs.
- The worker e2e test aborts right after `done`.

## Web

- The timeline shows "Personas online / Personas online" while paused: the stage title and its message are the same string. Use a distinct detail such as "Waiting for your questions".
- Notices from before a failure stay under a failed run. Clear the notice when the run becomes `failed` or `cancelled`.
- `uploadIds` is silently ignored on the interviews branch of `POST /messages`.
- `resumeStream` per question replays the stream from seq 0.
- "Generating report…" is local state until the next poll; the Cancel button disappears once `reportRequested` is set (the composer stop button still covers it).
- `target-selector.tsx` is now a static label; rename or inline it.
- The queue card omits the spec's "at most N min" bound.

## Docs

- `docs/hosting.md`: "interviews already asked finish first" is not true after `envCloseRequested`; "within about 30 seconds" holds only with no question in flight; the recreate-web guidance omits `DEMO_ALLOW_PAUSE`.
- The Phase 5 follow-ups doc still has the upstream MiroFish issue link placeholder.
