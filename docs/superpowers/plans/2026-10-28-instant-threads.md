# Instant threads implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A send from the home page renders immediately and streams in place with a browser-generated conversation id; the thread page loads with one session lookup and parallel queries and shows a skeleton instantly.

**Architecture:** The server accepts unknown chat ids on first use (`ensureOwnedChat`) from the message and upload routes. `Chat` gets a `new` mode that shows the welcome block until the first message, sends through the existing transport, then swaps the URL with native `pushState` (Next syncs `usePathname`). The thread loader parallelises its queries behind one cached session lookup.

**Tech Stack:** Next 16 App Router, React 19 (`cache`), AI SDK 7 `useChat`, Drizzle, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-28-instant-threads-design.md`

## Global Constraints

- Chat id regex (exact): `/^[A-Za-z0-9_-]{16,32}$/`. Ids are produced by `generateId()` from `ai`.
- `ensureOwnedChat` never reassigns an existing chat; an id owned by another user yields `null` → 404.
- No new rows for abandoned drafts: the chat row is created by the first message or the first upload only.
- The send path makes exactly one request: `POST /api/chats/:id/messages`. No `POST /api/chats`, no navigation, no `/stream` request.
- Comments only for invariants, single line. Strict TypeScript, Biome. `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm --filter web build` green at the end of every task.

## Review Focus

1. Two browsers using the same id: the second gets 404 on message and upload, nothing is reassigned. (Task 1 db test)
2. Back after the first send returns to the home page with an empty composer, and Forward returns to the thread without re-sending. (Task 2 browser check)
3. A reload at `/c/:id` during the run resumes exactly as before (page loader unchanged in behaviour). (Task 2 test + browser)
4. A follow-up or interview on an existing chat never goes through `ensureOwnedChat`. (Task 1 route tests)
5. Quota and usage bar update on the home send as they do today. (Task 2 test)

---

### Task 1: Server: create-on-first-use ids and a parallel thread loader

**Files:**
- Modify: `apps/web/src/server/chats.ts` (+ `chats.db.test.ts`), `apps/web/src/app/api/chats/[id]/messages/route.ts` (+test), `apps/web/src/app/api/uploads/route.ts` (+test), `apps/web/src/lib/session.ts` (+test), `apps/web/src/server/chat-page.ts` (+test), `apps/web/src/app/(chat)/c/[id]/page.tsx`
- Create: `apps/web/src/lib/chat-id.ts` (+test), `apps/web/src/app/(chat)/c/[id]/loading.tsx`

**Interfaces:**
- `isChatId(value: string): boolean` (regex above).
- `ensureOwnedChat(chatId: string, userId: string): Promise<Chat | null>`: `insert ... onConflictDoNothing()` then `getOwnedChat`; invalid id → `null` without a query.
- `getSessionUser` keeps its signature; wrap the body in React `cache` keyed by the `Headers` object (`import { cache } from 'react'`); a second call with the same headers performs no second `auth.api.getSession` call (test with a mocked `auth`).
- `loadChatPage(chatId, userId)` runs `listMessages`, `runStore.getLatestByChat` in `Promise.all`; `active = latest && (latest.status === 'queued' || latest.status === 'running') ? latest : null`; `materialiseRun` path unchanged. The page runs `getOwnedChat`, then `Promise.all([loadChatPage, getUsage])` (already) — keep.
- `listChats` becomes one query: a lateral/correlated subselect for the first filename.
- `loading.tsx`: a skeleton with the date marker line, one right-aligned bubble block and a console-sized block, using `components/ui/skeleton.tsx`.

- [ ] **Step 1:** `chat-id.test.ts`: accepts a 16-char `generateId()` value and a 32-char id; rejects 15 chars, 33 chars, `/`, `.`, empty. Implement.
- [ ] **Step 2:** `chats.db.test.ts`: `ensureOwnedChat` creates for a new id (row exists, title `''`), returns the same row on a second call, returns `null` for another user's id and leaves the owner unchanged, returns `null` for an invalid id without inserting. Implement.
- [ ] **Step 3:** messages route: in the run branch replace `getOwnedChat` with `ensureOwnedChat` **after** the body parse and **only** when neither an active run nor a done latest run exists for an existing chat — simplest: keep the current order (`getOwnedChat` first); when it returns `null` and `isChatId(id)`, call `ensureOwnedChat`; if still `null` → 404. Follow-up/interview branches are unreachable for a brand-new chat (no runs). Tests: new id → chat created and `startRun` called; another user's id → 404 and no create; follow-up on an existing chat → `ensureOwnedChat` not called.
- [ ] **Step 4:** uploads route: same `getOwnedChat` → `ensureOwnedChat` fallback. Test: upload to a new id creates the chat.
- [ ] **Step 5:** session cache test + implementation; chat-page parallel test (both store methods called, the active run derived from latest) + implementation; `listChats` single-query test (first file still present) + implementation; `loading.tsx`.
- [ ] **Step 6:** gates; commit `perf(web): client-provided chat ids created on first use; parallel thread loader`.

---

### Task 2: Client: send in place, swap the URL

**Files:**
- Modify: `apps/web/src/modules/chat/chat.tsx` (+test), `apps/web/src/modules/chat/home/home-chat.tsx` (+test; may shrink to a wrapper), `apps/web/src/app/(chat)/page.tsx`, `apps/web/src/modules/chat/composer/box-composer.tsx` (+test, only if `onNeedChat` changes), `README.md` (architecture bullet: ids are generated in the browser; a new conversation never waits on the server)

**Interfaces:**
- `Chat` props add `mode?: 'new' | 'existing'` (default `existing`) and `recent?: RecentChat[]` (for the welcome block in `new` mode).
- In `new` mode: `initialMessages = []`, `activeRun = null`; render `<Welcome>` while `messages.length === 0`; `Composer` `onNeedChat` resolves `chatId` immediately (no fetch); after the first `sendMessage` call succeeds (first chunk received, or simply after `sendMessage` resolves without `onError`), call `window.history.pushState(null, '', `/c/${chatId}`)` once and `upsertChat({ id: chatId, title: text.slice(0, 60), runStatus: 'queued' })`.
- `HomeChat` renders `Chat` in `new` mode with `chatId = useMemo(() => generateId(), [])` and passes `recent`, `limits`, `usage`, `signIn`.

- [ ] **Step 1:** `chat.test.tsx` (new mode): renders the welcome block and the starters; a starter fills the composer; sending with a file posts once to `/api/chats/<id>/messages` (mock fetch/transport) with the client id and **no** `POST /api/chats`; the user bubble appears before the response resolves; `history.pushState` is called once with `/c/<id>`; the welcome block is gone; `upsertChat` called with `runStatus: 'queued'`; the usage bar increments as it does for existing chats. Existing `home-chat.test.tsx` behaviours (refusal without a file, quota notice on 429, sending state) move to or stay green against the new wrapper.
- [ ] **Step 2:** Implement `new` mode and the wrapper. Keep `existing` mode byte-for-byte in behaviour (all current `chat.test.tsx` cases pass unchanged).
- [ ] **Step 3:** Browser check on the dev stack with the mock: home → attach `.context/test-seeds/1-four-day-week-announcement.txt` → send: the bubble and queued console appear at once, URL becomes `/c/:id` without a reload (network shows one messages POST, no `/api/chats`, no `/stream`), Back shows the home page, Forward shows the thread, reload mid-run resumes.
- [ ] **Step 4:** gates; commit `feat(web): send in place with a browser-generated conversation id`.

---

### Task 3: Measure and document

- [ ] Production after merge: warm and cold `GET /c/:id` TTFB (3 samples each) before (from the PR description baseline: warm 0.35 s, cold 2.3 s) and after; click-to-bubble observed in the browser. Record in the PR description.
- [ ] `docs/hosting.md` topology section: one sentence on client ids and create-on-first-use.
- [ ] Commit `docs: instant threads`.
