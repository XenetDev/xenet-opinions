# Prompt-only runs implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A run starts from a prompt alone; short prompts without a document get three optional context questions in a "Needs you" card first; the server seeds MiroFish with a generated `seed.md`.

**Architecture:** `buildSeedDocument` and `SEED_PROMPT_MIN_WORDS` live in the engine policy. The message route accepts empty `uploadIds` plus an optional `seed` object, writes `seed.md` through the existing upload writer after the quota check and chat creation, and starts the run with it. The client holds a pending run in `Chat` state, renders the user bubble and a `ContextCard`, and sends on confirm or skip.

**Tech Stack:** Next 16, React 19, AI SDK 7 `useChat`, Zod 4, Vitest + Testing Library + vitest-axe.

**Spec:** `docs/superpowers/specs/2026-10-28-prompt-only-runs-design.md`

## Global Constraints

- `SEED_PROMPT_MIN_WORDS = 40`; word count = `text.trim().split(/\s+/).filter(Boolean).length`.
- Seed fields `background`, `actors`, `change`: optional strings, trimmed, max 2000 chars each; the route rejects longer values with 400 `invalid_body`.
- Seed document format exactly as in the spec; `seed.md`, `text/markdown`, bytes = UTF-8 of the document.
- Order in the run branch: body parse → `run_active`/follow-up/interview branches unchanged → quota/rounds policy → upload ownership check (only when `uploadIds.length > 0`) → `ensureOwnedChat` → seed upload (only when `uploadIds.length === 0`) → `startRun`. `files_required` removed everywhere (route, tests, notices, docs).
- Copy (exact): card title "A little more context helps the simulation"; subtitle "Optional. MiroFish simulates better when it knows the situation."; labels "Background and constraints", "Who should be simulated", "What is changing"; placeholders "The rules, numbers and history that matter", "Customers, staff, competitors, the press…", "The decision or event you want to test"; buttons "Start run", "Skip and run with my question".
- Document runs and prompts of 40+ words are unchanged in behaviour. Comments only for invariants. Lint, typecheck, tests, build green per task.

## Review Focus

1. A refused run (quota, paused, rounds) with no uploads creates no seed upload and no chat row. (Task 1 route tests)
2. The seed upload belongs to the user and chat and is listed by the ontology stage's `data-sources` as `seed.md`. (Task 1 db test)
3. Reload while the card is showing: nothing was sent, nothing persisted, the home or thread renders as if the send never happened. (Task 2 test)
4. Sending a second message while the card is pending replaces the pending run; only one request is ever made. (Task 2 test)
5. A 40+ word prompt without a document sends immediately with no card and the server seeds from the prompt alone. (Task 1 route test, Task 2 test)

---

### Task 1: Engine seed policy and the message route

**Files:**
- Create: `packages/engine/src/policy/seed.ts` (+ `seed.test.ts`), export from `packages/engine/src/policy/index.ts`
- Modify: `apps/web/src/server/message-body.ts` (+test), `apps/web/src/app/api/chats/[id]/messages/route.ts` (+test), `apps/web/src/server/uploads.ts` (+ `uploads.test.ts` or a db test: `createSeedUpload`), `apps/web/src/modules/chat/send-notices.ts` (+test: remove `files_required`), `docs/hosting.md`, `README.md`

**Interfaces:**
- `wordCount(text: string): number`; `SEED_PROMPT_MIN_WORDS = 40`; `needsSeedContext(text: string, uploadCount: number): boolean`; `buildSeedDocument(input: { question: string; background?: string; actors?: string; change?: string }): string`.
- Body schema: `seed: z.object({ background: z.string().trim().max(2000).optional(), actors: …, change: … }).optional()`.
- `createSeedUpload({ chatId, userId, document }: { chatId: string; userId: string; document: string }): Promise<UploadSummary>` reusing `createUploads` with `{ name: 'seed.md', mediaType: 'text/markdown', size, bytes }`.

- [ ] **Step 1:** `seed.test.ts`: word count table (`''`→0, `'a  b'`→2, 39 words → needs context, 40 words → not); `needsSeedContext('short', 1) === false`; `buildSeedDocument` exact output with all fields, and with none ("Not provided." ×3). Implement.
- [ ] **Step 2:** message-body tests: `seed` optional, trims, rejects 2001 chars; empty `uploadIds` accepted. Implement.
- [ ] **Step 3:** route tests: no uploads + no seed → `createSeedUpload` called with the question-only document and `startRun` gets `[seedId]`; no uploads + seed fields → document contains them; quota exceeded with no uploads → 429 and `createSeedUpload`/`ensureOwnedChat` not called; another user's id with no uploads → 404 via `ensureOwnedChat` null and no seed; uploads present → `createSeedUpload` not called and behaviour unchanged. Remove the `files_required` tests. Implement.
- [ ] **Step 4:** `createSeedUpload` db test: row has `filename 'seed.md'`, `mediaType 'text/markdown'`, correct owner; storage object readable. Implement.
- [ ] **Step 5:** notices and docs; gates; commit `feat(web): runs start from a prompt alone with a generated seed document`.

---

### Task 2: Context card and pending send

**Files:**
- Create: `apps/web/src/modules/chat/parts/context-card.tsx` (+test)
- Modify: `apps/web/src/modules/chat/chat.tsx` (+test), `apps/web/src/modules/chat/composer/box-composer.tsx` (+test: remove the no-file refusal), `apps/web/src/modules/chat/thread/thread.tsx` only if a pending turn needs a slot

**Interfaces:**
- `ContextCard({ onStart, onSkip, pending }: { onStart: (seed: { background?: string; actors?: string; change?: string }) => void; onSkip: () => void; pending: boolean })`; `Frame` with the "Needs you" badge; three textareas with labels; Enter inside a textarea inserts a newline (no submit); both buttons disabled while `pending`.
- `Chat` state `pendingRun: { text: string; runOptions: RunOptionsValue } | null`; the run `onSend` sets it when `needsSeedContext(text, uploadIds.length)` and does not call `sendMessage`; the thread renders a user bubble with `pendingRun.text` and the card as the last turn; `onStart(seed)`/`onSkip()` call `sendMessage({ text }, { body: { uploadIds: [], runOptions, ...(seed ? { seed } : {}) } })` and clear the pending state; a later `onSend` replaces `pendingRun`.

- [ ] **Step 1:** `context-card.test.tsx`: copy exact; Start passes only non-empty trimmed fields; Skip passes nothing; disabled while pending; Enter in a textarea does not call `onStart`; axe.
- [ ] **Step 2:** `chat.test.tsx`: short prompt with no file → card shown, no request; Start with fields → one POST with `seed`; Skip → one POST without `seed`; 40-word prompt → immediate POST, no card; file attached + short prompt → immediate POST; second send while pending replaces the pending text; `new` mode: URL swap still happens only after acceptance.
- [ ] **Step 3:** `box-composer`: remove the no-file refusal and its tests (`files_required` notice gone).
- [ ] **Step 4:** Browser check on the dev stack: starter prompt without a file → card; fill one field → Start → run streams and the sources chip reads `seed.md`; reload mid-card → clean home; 40-word prompt → immediate run. Gates; commit `feat(web): context questions before a prompt-only run`.
