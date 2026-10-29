# Run readiness check: design

Addendum to `docs/superpowers/specs/2026-10-28-prompt-only-runs-design.md`. **Owner (2026-10-29):** everyone who sends a prompt, with or without documents, should get a simulation. When the prompt and documents don't tell MiroFish who to simulate, ask before the run starts, and arrive with the answers already drafted.

## Why

A tester uploaded a pitch deck and asked "Is this a good investment opportunity". The run failed at "Generating personas" with "MiroFish found no people or groups in the knowledge graph to simulate". A pitch deck names a company and a product, not a population with opinions, so MiroFish's ontology found no actors. The "Needs you" card never appeared: today it only opens when there are no uploads and the prompt is under 40 words, and document runs never get the seed document either. Most users will do what the tester did. They don't know what MiroFish needs, and a failure four steps in, after spending a run, makes them leave.

## Goals

- Before any run starts, a check reads the prompt and the documents and decides whether MiroFish can find people and groups to simulate.
- If it can, the run starts exactly as today; the user notices only a brief "Reading your brief…" state.
- If it can't, the existing "Needs you" card opens in the thread **pre-filled** with drafted answers (background, who is involved, what is changing) derived from the prompt and documents. One click ("Run with these") starts the run. The user may edit or clear any field.
- Whenever the card was used, the scenario seed document travels with the uploaded documents, so MiroFish sees the confirmed "Who is involved" section.
- When a run still fails with the no-people error, its button reopens the pre-filled card instead of "Retry from here".

## Non-goals

- Forcing a fixed persona list. Drafted actors must come from the prompt and documents.
- Changing MiroFish, its ontology prompts or the worker's stage machine.
- Judging whether the question is a "good" question beyond whether it can be simulated.
- Reading images or scanned PDFs (no OCR). Documents with no extractable text are treated as empty for the check.

## Anti-goals

- The check blocking or delaying a run when it is unsure, slow, or down. Failure of the check must fall back to sending the run.
- Spending a quota slot, or creating run rows, before the user confirms the card.
- Generic drafts ("customers, staff, the press") when the document says something specific. Drafts that ignore the document are a failure even if the run succeeds.
- A second questionnaire UI. This is the same card.

## Facts

- The web app makes no LLM calls today. MiroFish uses an OpenAI-compatible endpoint configured by `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL_NAME` (default `gpt-4o-mini`).
- PDF text extraction happens inside MiroFish today; the web app has none. Uploads live in S3 (Tigris) in production and on local disk for self-host; the web app reads them through `storage.get`.
- `needsSeedContext(text, uploadCount)` in `packages/engine/src/policy/seed.ts` gates the card in `apps/web/src/modules/chat/chat.tsx`. `buildSeedDocument` already fills empty fields with generic defaults.
- `POST /api/chats/:id/messages` creates the seed upload only when `uploadIds` is empty. `MAX_FILES = 5` per message; the total per run is capped at 48 MB.
- The no-people error string comes from `packages/mirofish/src/messages.ts`.

## Decisions

- **Model and key (owner approved).** Reuse MiroFish's OpenAI-compatible settings. The web app gets `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL_NAME` (same values as MiroFish). All optional: when `LLM_API_KEY` is unset the check is off and the app behaves as today plus the seed-with-uploads change.
- **Where it runs.** In the web app, as a new authenticated endpoint called by the client on send, before `POST /messages`. It writes nothing and spends no quota.
- **Input.** The prompt plus the first ~12k characters of extracted text per document (PDF via a serverless-friendly text extractor such as `unpdf`; Markdown and text read directly). Builder chooses the exact truncation.
- **Output.** Structured JSON: `{ ready: boolean, draft?: { background, actors, change } }`. `ready: false` means "MiroFish is unlikely to find specific people or groups". When `ready` is false, `draft` must be present, and `draft.actors` must list concrete groups drawn from the prompt and documents (for the deck: angel investors, seed VCs, prospective customers, competitors, tech press).
- **Timeout and failure.** About 8 seconds. Timeout, model error, invalid JSON or extraction failure all count as `ready: true` (send as today). The check must never be the reason a run doesn't start.
- **Fast path.** No documents and 40+ words: skip the check. Every other first send runs it, including short prompts without documents, which today always get the empty card.
- **Card.** The existing `ContextCard`, given initial values. Title and description change when pre-filled, e.g. "We drafted who to simulate" / "Check these and run. Edit anything that's wrong." Primary button "Run with these". The "Skip and run with my question" button stays only when the card opened without drafts (check off or failed for a short prompt). Empty fields fall back to `buildSeedDocument`'s defaults as today.
- **When the seed is attached (owner, 2026-10-29).** With no uploads, `seed.md` is written as today. With uploads, `seed.md` is added next to them only when the request carries `seed` answers from the card. Document runs that passed the check, or where the check was off or failed, are sent byte-for-byte as today, so generic default actors never dilute a specific document. The seed does not count toward the user's `MAX_FILES` (the server adds it after validating the user's files) and is small enough not to matter for the 48 MB total.
- **No-people failure (owner, 2026-10-29).** In the run console, when the failed stage's error is the no-people message, the button reads "Add who's involved" and reopens the card pre-filled (calling the check again with the original prompt and uploads). Confirming is a retry, not a new run: it spends no quota, adds no new user message, keeps the run in the same thread, and restarts the run from reading the documents with the original uploads plus a new `seed.md` built from the answers (replacing any earlier seed). Builder decides how the client recognises this error, preferably a stable code rather than matching the English string, and how the retry path in `apps/web/src/server/retry.ts` is extended.
- **Quota and pause first (builder-check call).** The check endpoint applies the same demo-paused and daily-quota checks as `POST /messages` before calling the model, and returns those errors the same way, so nobody fills a card only to be refused. It still writes nothing. The "Add who's involved" path skips the quota check, as retries do.
- **Rate limit (builder-check call).** The check endpoint is limited per user (about 20 calls per hour). Over the limit it answers `ready: true` without calling the model, so the user is never blocked. Builder chooses the mechanism; the app has no shared rate limiter outside Better Auth today.
- **Pending state.** While the check runs, the composer shows the sent text and a "Reading your brief…" status. The user can't send twice.

## Left to the builder

- The prompt wording for the check model, kept in one file with a test against representative inputs (pitch deck, survey results, short price-change prompt, long detailed prompt).
- Endpoint name and shape, error mapping and the exact truncation limit.
- How the check is mocked in tests and in the local mock MiroFish stack.
- Hosting docs and `.env.example` updates for the three new web env vars.
