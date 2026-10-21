# Phase 1 follow-ups (deferred from per-task and final review, 2026-10-20)

Source: SDD ledger for docs/superpowers/plans/2026-10-20-phase-1-pipeline.md. The final whole-branch reviewer triaged every deferred minor; fix-before-merge items were applied in eae787c..344ac79. Everything below is Phase 2+ or dropped-with-reason.

## Phase 2 design notes from the final review (binding inputs to the Phase 2 plan)
- [x] Retry-from-stage must create a NEW run row + assistant message (or record a seq boundary): the tail replays from seq 0 and stops at the first `error`, so retrying on the same row never streams. A retry must also clear `simStarted`, `startAcked`, `startAttempts`, `idlePolls`. (resolved in Phase 2)
- [x] Fence writes: `update`/`appendEvent`/`fail`/`transition` should be conditional on `status='running' AND lease_owner=$owner` so a cancel cannot be overwritten by a late `fail`/`finished`. (resolved in Phase 2)
- [x] Cancel needs a terminal event kind (`cancelled`) and a `StageStatus` for it; the tail never reads run status. (resolved in Phase 2)
- [x] Page loader re-projects un-materialised terminal runs from `run_events` (materialised `messages.parts` is a cache); cancel materialises explicitly. (resolved in Phase 2)
- [x] `GET /api/chats/:id/stream` reuses `tailRunAsUIMessageStream`; floor `pollMs` at 1; add resume tests (pre-aborted signal, listEvents throws, backoff). (resolved in Phase 2)
- [x] Release the lease on SIGTERM (`lease_until = now()`), and heartbeat-renew during long calls (ontology up to 600 s) before a second worker exists. (resolved in Phase 2)
- [ ] Transient DB errors inside a handler currently fail the run permanently; poll-only errors should be retried more leniently than enter errors.
- [ ] `ontology.poll` resume should re-emit the `ontology` card.
- [x] Document the 280 s tail limit for real-MiroFish runs until resume lands; note the ~60 s lease wait on worker restart. (resolved in Phase 2)

## Deferred minors (per-task reviewers; final triage: Phase 2/4/5 or drop)
- Task 1: minor (deferred): empty-string S3 vars not normalised to undefined; WORKER_POLL_MS/MAX_CONCURRENT_RUNS accept 0/negatives (should be positive); s3 refine test only covers the all-missing case; no default assertions for STORAGE_LOCAL_DIR/MAX_CONCURRENT_RUNS; next.config passes console as log (possible duplicate "Loaded env" line)
- Task 2: minor (deferred): 44 duplicate edges in mock sample graph (fixtures.ts edge formula); max_rounds test uses the default value; failStage tested only for graph_build; mid-flight behaviours untested; token checked after routing; round counter keeps advancing after stop/failed; posts requires platform
- Task 3: minor (deferred): runs.test user insert sits before try (pool leak on failure); run_events.payload jsonb lacks $type; cause.message assertion depends on Drizzle error wrapping
- Task 4: minor (deferred): partIdFor payload typed `| unknown` (collapses generic); done/report_text types not z.infer-derived; to-chunks re-declares event shape; no compile-time satisfies check of Stage vs db; data chunk with null partId yields id undefined (unreachable)
- Task 5: minor (deferred): drizzle claim tests not isolated from foreign queued/running rows in the shared dev DB; memory store queuedAt sub-ms tick is dead (getLatestByChat tie bug); `require` local name; deps order
- Task 5: minor (deferred): assertNoForeignActive only guards test start, not concurrent DB test files
- Task 8: minor (deferred): uploadKey keeps dot-only filenames (local rejects, s3 accepts); NoSuchKey matched by name only; from-env fallback `.storage` vs web default `.data/uploads`; EISDIR unmapped on local get; env/uploadKey tests weak and placed in s3.test.ts
- Task 6: minor (deferred): other enters re-invoked on retry (accepted risk per ruling); agents event deduped by count only; RunFeedCursor/RunOutlineCursor duplicate parts types without compile-time link
- Task 6: minor (deferred): swallowed-start path emits no sim_run running event; report drain has no overall bound if agent-log never returns an empty page; posts backlog beyond 20 pages dropped; non-idle non-terminal runner_status has no overall timeout; real-MiroFish idle semantics need e2e confirmation
- Task 7: minor (deferred): no backpressure across the cancel wrapper; pollMs 0 tight timer loop (floor it); hand-built materialise log can drift from orchestrator partIds; createUIMessageStream not parameterised with OpinionsUIMessage; backoff/pre-aborted/listEvents-throws untested
- Task 9: minor (deferred): e2e lacks foreign-run preflight; restart case can race at speed 50; no finally/safety abort on failure in e2e case 2; vacuous terminal-not-reticked test; weak renewLease/materialise assertions; duplicate abortable sleep in main.ts; log meta can clobber ts/msg; partial-setup leak
- Task 10: minor (deferred): existingCount hardcoded 0 (per-request cap only; follow-up to count a chat's pending uploads); formData buffers before size check; findRepoRoot duplicated in storage.ts/next.config.ts; text/x-markdown not accepted; parameterised-type and ordering tests missing
- Task 10: minor (deferred): createUploads with empty files calls values([]) (route rejects earlier); Turbopack fs-tracing warning for @xo/storage local.ts
- Task 11: minor (deferred): appendMessage/updateMessageParts now dead in chats.ts; transaction body untested (db.transaction mocked wholesale); cross-chat message-id collision silently skipped by onConflictDoNothing; maxRounds boundary tests missing
- Task 12: minor (deferred): initialRunActive not yet wired from the page (Task 13 wires it); empty-text guard via throw; orphaned uploads on failed send; `@/server/upload-rules` path for a client-safe module; suggestion component install deferred to Task 13
- Task 12: minor (deferred): Enter during upload may re-fire onSubmit; chat.tsx notices untested; stop() aborts client stream only (server run continues by design)
- Task 13: minor (deferred): dispatcher test omits ontology/feed fixtures; workbench status icon lacks text alternative; collapsed wiring only indirectly tested; events with sectionIndex outside the outline dropped silently; SourcesTrigger says "Used N sources" and links have no href; suggestion component installed but unused
- Task 14: minor (deferred): worker does not release its lease on SIGTERM, so a restarted worker waits ~60 s to reclaim its own run (graceful shutdown should set lease_until = now)
