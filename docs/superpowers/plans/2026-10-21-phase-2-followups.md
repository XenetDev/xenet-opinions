# Phase 2 follow-ups (deferred from per-task and final review, 2026-10-21)

Source: SDD ledger for docs/superpowers/plans/2026-10-21-phase-2-resume.md. Fix-before-merge items were applied in 6475a69..4584bb4. Everything below is Phase 3+ or dropped-with-reason.

## Phase 3 design notes (binding inputs)
- [x] Dedicated test database (`TEST_DATABASE_URL`, default `xo_test`) migrated in a vitest `globalSetup` that clears leftover `queued|running` runs; then drop `--concurrency=1`. (resolved in Phase 3)
- Fence on lease epoch/`attempt` (not only owner) before running more than one worker replica with a fixed `WORKER_ID`.
- Extract a `withOwnedChat` route helper (auth + ownership boilerplate is now in 7 routes).
- Pass the worker abort signal into MiroFish calls so SIGTERM releases the lease promptly even during a 600 s ontology call; README says "after the current step".
- Transient DB errors inside a stage handler fail the run permanently; poll-only errors should retry more leniently than enter errors.
- `ontology.poll` resume should re-emit the `ontology` card.
- Map raw error codes (`run_active`, `run_not_active`, `run_not_failed`, …) to sentences in every notice.
- Cancel-then-retry is refused (409 `run_not_failed`); decide whether cancelled runs should be retryable.
- `cancelRun` racing a chat delete surfaces `run_not_found` as a 500 (narrow; existed before).
- `handleLost` null-branch cleanup uses the claim-time in-memory run; ids written during the same tick could be missed.
- Stop during `submitted` (before the run row exists) gets a 404 and the run still starts; the poll then reattaches. Consider a short client-side "cancel pending" that re-issues once the run id is known.
- Retry at `sim_run` copies feed/post cursors; verify against real MiroFish whether post storage survives a restart.
- `/run` returns `lastSeq` which the client never reads; use it (e.g. detect replay completeness) or drop it.
- Sidebar: delete-failure feedback; `Home.start` error handling; rename/delete flow tests.

## Deferred minors (per-task reviewers; final triage: Phase 3 or drop)
- Task 1: minor (deferred): `run.stage as Stage` cast; to-chunks casts payload instead of using CancelledData; no materialise test with a cancelled event; no queued-run cancel test; timeline test doesn't assert icon/no-shimmer
- Task 2: minor (deferred): owner check duplicated in renewLease/releaseLease (could reuse `fenced`); fence checks owner only, not lease epoch/attempt (safe while owner ids are per-process and one tick per run); machine fence tests sit in the "failures" describe; import order
- Task 3: minor (deferred): Focus 1 test discards the first tail's partial message; 204 test doesn't assert absence of stream headers; /run two non-atomic reads; third copy of auth boilerplate across routes; duplicate `ai` imports in tail.test
- Task 3: minor (deferred): Focus 1 test lost the explicit "first tail did not finish" assertion (now only parts.length > 0)
- Task 4: minor (deferred): spurious resumeStream after normal completion (harmless, 204); fetchRef written during render; no chat.tsx effect tests; `_userId` unused in loadChatPage
- Task 4: minor (deferred): a run that finishes before the first post-send poll is exposed only after the 6-poll cap (~30 s); hook state not reset to none per send (brief stale terminal); rejected POST keeps polling ≤30 s; `initial` not reseeded on chatId change
- Task 5: minor (deferred): raw error codes shown in cancel/retry notices; chats.updated_at untested in retry.db.test; duplicate active-run lookup on cancel; rare stale Retry button if the new run finishes before refresh; copied payloads inserted unparsed
- Task 6: minor (deferred): heartbeat ignores a resolved `false` from renewLease (lost lease mid-tick unlogged until next fenced write); fixed-sleep "stop called once" assertions; no test for fail() throwing FenceError
- Task 7: minor (deferred): `?q=` re-prefills the composer after a remount (replace URL once consumed); sync throw inside storage.delete map could escape allSettled; delete failure silent in the dialog; sidebar flows untested beyond render; Home.start lacks catch; slice(0,60) can split surrogates; chat height coupled to header h-12
