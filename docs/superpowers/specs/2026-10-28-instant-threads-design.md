# Instant threads: design

Addendum to `docs/superpowers/specs/2026-10-19-xenet-opinions-design.md`. Owner request (2026-10-28): sending a message must feel instant; conversation ids may be created deterministically on the client if that is what it takes. Every decision below is the builder's call unless marked **owner**.

## Intent

Today a send from the home page chains three server round-trips before anything changes on screen: create the chat, post the message (the run starts and the stream opens), then navigate to `/c/:id`, which renders the thread on the server and reattaches the stream. Each hop is about 300 ms warm from London and up to 2 s on a cold instance, so a click can take one to five seconds to show a result. **Owner:** make it feel fast, using best practice, including client-generated conversation ids.

## Goals

- A send shows the user's message and the queued console immediately, and the run stream flows into the same component. No navigation and no server render happen on the send path.
- The browser owns the conversation id. The server accepts a conversation it has not seen before from the first request that references it (message or upload), creating it for the current user.
- The URL becomes `/c/:id` as soon as the first message is sent, without a page load; Back returns to the home page; reload and deep links keep working through the thread page.
- The thread page (reload, deep link, chat switcher) renders with one session lookup per request and all its queries in parallel, and shows a skeleton instantly while it loads.
- Measured on production: the send-to-first-render time drops from seconds to the time of one streamed request, and the thread page's warm time-to-first-byte drops by at least a third.

## Non-goals

- Changing the worker, the engine, the run state machine, or the stream contract.
- Offline drafts, optimistic assistant text, or speculative pre-creation of chats on page load.
- Caching chat content across navigations beyond what the router already does.

## Anti-goals

- A chat row that exists with no message (the current `POST /api/chats` on attach creates one; the new flow must not create rows for abandoned drafts, except when a file is uploaded, which needs a row for ownership).
- Two users able to claim the same id: an id that exists for another user is a 404, never a takeover.
- Any duplicate assistant turn or re-streamed run as a result of the URL swap.

## Decisions

- **Client ids.** `generateId()` from `ai` (same generator as the server) produces the id when the home component mounts. Ids are validated server-side with `/^[A-Za-z0-9_-]{16,32}$/`.
- **Create on first use.** `ensureOwnedChat(chatId, userId)` in `server/chats.ts`: `INSERT ... ON CONFLICT (id) DO NOTHING` then select; returns the chat when it belongs to the user, `null` otherwise. `POST /api/chats/:id/messages` (run branch only) and `POST /api/uploads` use it instead of `getOwnedChat`; follow-up and interview branches keep `getOwnedChat` (they need an existing run anyway). `POST /api/chats` stays for API compatibility but the UI no longer calls it.
- **One component.** `Chat` gains `mode: 'new' | 'existing'`. In `new` mode it renders the `Welcome` block (starters, recent chats) while there are no messages and the composer in run mode; the first send calls `sendMessage` through the existing transport (the POST response is the run stream, so there is no resume and no `/stream` request); after `sendMessage` resolves its first chunk the component calls `window.history.pushState(null, '', '/c/:id')` (Next's App Router syncs `usePathname` with native `pushState` since 14.1) and `upsertChat({ id, title, runStatus: 'queued' })`. The home route's server component becomes a thin wrapper rendering `Chat` in `new` mode with a fresh id and the same `limits`/`usage`/`signIn` props. The thread route renders `Chat` in `existing` mode exactly as now.
- **Uploads before the first send** use the same client id, so a file attached on the home page creates the chat then (unchanged behaviour, one fewer request).
- **Thread page loader.** `getSessionUser` is wrapped in React `cache()` keyed by the request's headers object so layout and page share one lookup. `loadChatPage` runs `listMessages`, the latest run (one query ordered by `queued_at desc limit 1`; the active run is that row when its status is `queued`/`running`, since at most one run per chat is active) and `getUsage` in one `Promise.all` after the ownership check; `listChats` becomes a single query with a lateral subselect for the first file. A `loading.tsx` under `c/[id]` renders the header-less thread skeleton.
- **Measurement.** Before and after on production: warm and cold `GET /c/:id` TTFB, and the browser-observed time from click to the user bubble appearing (manual stopwatch is fine; the goal is "immediate").

## Constraints

- All existing tests keep passing; the new-mode home keeps every behaviour the `HomeChat` tests pin (starters fill the composer, refusal without a file, quota notices, sending state).
- Strict TypeScript, Biome, comments only for invariants.
- No change to the data parts, routes' response shapes, or the stream.

## Left to the builder

- Whether `HomeChat` is deleted or reduced to the wrapper; whether `Welcome` moves under `modules/chat/thread`.
- The exact skeleton layout in `loading.tsx`.
- Whether the ownership check in `loadChatPage` can fold into the messages query (it can stay separate if the parallel version is already under 50 ms warm).
