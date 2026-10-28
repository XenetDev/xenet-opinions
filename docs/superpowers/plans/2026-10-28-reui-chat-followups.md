# ReUI chat follow-ups (2026-10-28)

Deferred findings from the task reviews and the whole-branch review of `ui/reui-chat`. None blocks the merge.

## Console

- A historical run whose message ends mid-stage with no terminal part keeps the "Working" badge and a live row; `windowLive === false` could settle it.
- Done stage rows no longer show their last stage message (the old timeline could expand it).
- A section still `writing` when the report stage fails or is cancelled keeps the queued ring, and a failed report row leaves its tool children "Running".
- "Generating report…" renders its own `role="status"` next to the band when no NoticeRegion routes it; a chat screen has two status nodes (notice region plus band) and one more per historical console.
- `ConsoleModel.title` and `elapsedSeconds` are never populated; `lastData` is duplicated between `derive.ts` and `message-parts.tsx`; `step.total` becomes 8 when a generic "Run failed" row is appended after 7 done rows; `FrameFooter justify-between` has one child since the clock was dropped.
- For about 2 s before the pause the spinner sits on "Writing the report" (the interviews part arrives after the stage transition).
- Tests count rows by `data-kind` in places; prefer roles and text.

## Thread and parts

- Header time only for messages that arrive live; persisted messages need a `createdAt` in the UI message metadata from `loadChatPage` to show "Xenet Opinions · HH:MM" after reload.
- Long `aria-label` on user turns ("You: " plus the whole question); use `aria-labelledby` with a short label.
- `useArrivals` sets state in a layout effect (one extra commit per new message); a ref keyed on first-seen ids would do.
- Once the report text exists, the graph, roster and feed Frames could default to collapsed so the report is nearer the top.
- One unreproduced case where a roster click after reload hit the feed.

## Composer and home

- A failed `POST /api/chats` at send with files attached surfaces only as `create_failed` on the chip; show a send-level notice and keep the files pending.
- Focus order: the "+" button sits after the textarea in the DOM but is drawn first.
- `composer.test.tsx` and `pill-composer.test.tsx` test the same component; merge them.
- The sr-only upload status words are not a live region.
- The home send test checks the unread response body is cancelled but not that it happens before `router.push`.
- Starter focus reaches into the DOM with `querySelector`; expose a focus handle.
- `/` and the layout each call `listChats`; share one query.
- Resume rows and stored chat titles are cut at 60 characters without an ellipsis (server-side title rule).
- Magic numbers: the 60-character title cut in three places plus the server; `slice(0, 5)` for resume rows; `[--shimmer-duration:2.4s]` repeated.
- `h-svh` leaves a strip under the composer if a mobile browser arrives with its address bar already minimised; check on a device.
