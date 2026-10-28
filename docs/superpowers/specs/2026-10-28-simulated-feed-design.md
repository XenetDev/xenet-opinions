# Simulated feed clarity: design

Addendum to `docs/superpowers/specs/2026-10-19-xenet-opinions-design.md`. **Owner (2026-10-28, after feedback from a first external viewer):** the Twitter/Reddit card is not obviously a simulation and the posts show an internal number as the author; make it clear that personas are posting and replying to each other on a simulated network, not that real posts are being fetched.

## Facts

- MiroFish's `/posts` rows carry `user_id`, which equals the roster profile `id` emitted in `data-agents` (verified on three production runs).
- MiroFish's `/comments` endpoint (`platform`, `post_id`, `limit`, `offset`) returns OASIS comment rows (`comment_id`, `post_id`, `user_id`, `content`, `created_at`); the worker never fetches it today.
- The feed part persists per run; existing runs have `posts` only.

## Goals

- The card reads as a simulation at a glance: title "Simulated feed", a one-line description, the round as a badge.
- Each post shows the persona's name and role (from the roster) with initials; unknown ids fall back to "Persona N".
- Replies between personas are fetched during the run and shown nested under their post, so the "interactions" are visible. Old runs without replies render as before.
- The mock MiroFish serves replies so the dev stack and tests cover the path.

## Non-goals

- Likes, shares, follower counts; threading deeper than one level; fetching anything from real networks.
- Changing the report or interview flows.

## Decisions

- **Part schema.** `SimFeedData` gains `replies?: Array<{ id: string; postId: string; platform: 'twitter' | 'reddit'; agent: string; content: string; round: number }>` (optional for backward compatibility). `round` is the feed round at fetch time.
- **Client.** `simulation.comments(simulationId, { platform, limit?, offset? })` in `packages/mirofish`, schema `Comments` mirroring `Posts` (loose objects, `comments` array).
- **Worker.** `sim-run` fetches comments per platform after posts, with cursors `commentsOffsetTwitter` / `commentsOffsetReddit`, maps via `commentsToReplies(res, platform, round)` (`id` from `comment_id`/`id`, `postId` from `post_id`, `agent` from `user_id`/`agent_id`), appends to the feed with the same `MAX_POSTS`-style cap (`MAX_REPLIES = 300`), and emits `sim_feed` when posts or replies were added or the round changed.
- **Mock.** `GET /api/simulation/:id/comments` returns generated replies for existing posts (two per post from other agents, round-stamped), paginated like posts.
- **UI.** `SimulationFeed({ data, agents })`: `FrameTitle` "Simulated feed"; a muted line under the header: "Personas post and reply to each other on a simulated Twitter and Reddit. Nothing here comes from the real sites."; `Badge` "Round r of n" beside the title; tabs unchanged ("Twitter · n", "Reddit · n"). Post header: `name · role · round r` (role omitted when unknown); avatar initials from the name. Replies nest under their post (indented, smaller avatar, `name · replied`), at most 3 shown per post with "+N more replies" expanding on click. Posts without replies look as today.
- **Copy for unknown personas:** `Persona ${id}`.

## Constraints

- No change to events already persisted; the projector and materialiser only pass the new optional field through.
- Strict TypeScript, Biome, comments only for invariants; gates green per task.

## Left to the builder

- Reply ordering (by id is fine) and the exact expand control.
- Whether the mock's reply text is templated or random; it must be deterministic under `MOCK_SPEED`.
