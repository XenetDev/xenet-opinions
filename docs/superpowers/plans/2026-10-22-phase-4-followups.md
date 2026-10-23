# Phase 4 follow-ups (deferred from per-task and final review, 2026-10-22)

Source: SDD ledger for docs/superpowers/plans/2026-10-22-phase-4-hosting.md. Everything below is Phase 5+ or dropped-with-reason.

## Phase 5 design notes (binding inputs)
- Real MiroFish with keys is unverified: the `real` compose profile was checked only up to the expected no-keys exit (exit 1, `配置错误`), and the hosted demo has not been deployed. The first keyed run must confirm `/health` through the proxy and one 1-round run end to end.
- The official MinIO images are no longer published; the bundle uses the `pgsty/minio` and `pgsty/mc` community fork pinned by release tag. Pin them by digest or replace them (RustFS, SeaweedFS or Garage) in Phase 5.
- The web standalone image traces the whole web source because of the pre-existing Turbopack warning from `packages/storage/src/local.ts`; fix with `turbopackIgnore` on the dynamic path.
- The quota check is not atomic with `startRun`, so concurrent sends from one user can exceed `MAX_RUNS_PER_DAY` by one.
- Re-check the "Vercel Hobby caps functions at 60 s" claim against Fluid compute limits; Pro is still required for `maxDuration` 300.
- The hosted-demo topology in `docs/hosting.md` needs an explicit environment variable list for the container host (worker, mirofish-proxy, mirofish).
- A blank `MIROFISH_TOKEN` fails silently: health stays ok (`GET /health` bypasses the token) while every other MiroFish call returns 401.
- The CI docker job has no layer cache.
- Chat delete does not close the simulation env (carried from Phase 3).

## UX observations from verification (deferred)
- A run rejected for quota leaves the user's message in the transcript.
- Hidden file inputs are not `disabled` while the demo is paused (textarea and submit are).
- The pause UI is a single notice line above the composer rather than a page banner; confirm this is the intended design.
- A run rejected for quota or pause still creates an empty chat when started from the landing page.

## Deferred minors (per-task reviewers; final triage done)
- Task 1: minor (deferred): tail tests lack null-position-then-0 and single-0-across-batches cases; memory test mutates store.runs directly
- Task 2: minor (deferred): quota check not atomic with startRun (concurrent sends can exceed by one); literal 40 repeated in limits/composer/run-options; `resetAt?.` hides contract break; landing page creates chats while paused; no RED output for server pieces
- Task 3: minor (deferred): db check in health not time-bounded; `migrated` logged before client.end(); mock startup log hardcodes 127.0.0.1; no RED run
- Task 4: minor (deferred): web image ships source via whole-project tracing (storage local.ts cwd resolve); migrator prints bare `Error` on ECONNREFUSED inside container; esbuild build-script warning in worker image; CI docker job has no layer cache
- Task 5: minor (deferred): MiroFish container runs as root; .git and build tools stay in the image (3.9 GB arm64); HEALTHCHECK start-period unproven against measured cold start; retain.sh leading-dash path; CEL == not constant-time (note in README)
- Task 5: minor (deferred): check_health_only accepts either outcome; README "everything except /health" wording (now GET/HEAD only); README forward-references compose
- Task 6: minor (deferred): blank MIROFISH_TOKEN fails silently (health ok, calls 401); real-profile web shows unhealthy while MiroFish starts; hosted topology lists no container-host env vars; edge network redundant; Vercel Hobby 60 s claim may be outdated under Fluid compute (Pro still required)
- Task 7: minor (deferred): quota-rejected user message stays in the chat; hidden file inputs enabled while paused; pause notice is a line above the composer not a page banner; brief's wget isolation check is vacuous (web image has no wget) — fetch-based check used
- Task 8: minor (deferred): runbook `add` helper passes empty S3_ENDPOINT on the AWS path; `.vercel` not gitignored; retention via railway ssh stdin unverified

## Final review minors (deferred)
- Railway legacy IPv6-only private networking needs `FLASK_HOST=::` on `mirofish`.
- `checkRunPolicy` result union is not narrowed per code (`max` unused on quota, `resetAt?.`).
- A `running` run with an expired lease briefly counts as ahead in the queue.
- The Vercel Hobby 60 s claim predates Fluid compute (Pro still recommended).
- The MiroFish container runs as root; pull into Phase 5 early, since it parses untrusted PDFs.

Final review triage: all deferred; none block merge after the fix wave.
- Final re-review: retries are free under the quota with no cap of their own (a chat whose runs keep failing can be retried indefinitely); and the retry route never calls `checkRunPolicy`, so a failed run can be retried while `DEMO_PAUSED=1` (plan says pause refuses new runs only). Decide in Phase 5 whether the kill switch must also stop retries.
