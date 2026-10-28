# Round 3: graph visualisation, interview language, resumable stream

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox syntax.

**Goal:** Three owner findings from testing: the knowledge graph is far weaker than MiroFish's own; a persona answered an interview in Chinese; the thread visibly re-streams whenever the stream reconnects or an interview is sent.

**Spec:** `docs/superpowers/specs/2026-10-28-reui-chat-design.md` (round 1 and 2 Decisions stand) plus the Decisions below.

## Decisions

- **Graph.** `GraphPreview` becomes a real visualisation on the existing `react-force-graph-2d`: 420px tall (full viewport height in a fullscreen `Dialog`), nodes drawn with `nodeCanvasObject` as a filled circle plus the label beside it (label hidden below a zoom threshold, always shown on hover), colour per entity `type` from a fixed 10-colour palette assigned in order of first appearance, a legend row of entity types with their colours under the canvas, a subtle dot-grid background, link colour `border` token, a "Show edge labels" toggle (`Switch`, off by default) that draws `link.label` at the link midpoint, a Refresh button (reheats the simulation and re-fits), a Fullscreen button, zoom/pan enabled, `onNodeHover` highlighting the node and its links, `onEngineStop` fit-to-view once. Node radius scales with degree (min 3, max 9). The sr-only list stays. The engine's `MAX_NODES` sampling rises to 400 and keeps nodes with the most links first.
- **Interview language.** The worker appends a language instruction to every interview prompt sent to MiroFish, derived from `MIROFISH_LOCALE` (`en` → "Answer in English.", `de` → "Antworte auf Deutsch.", `es` "Responde en español.", `fr` "Réponds en français.", `pt` "Responda em português.", `ru` "Отвечайте на русском языке.", `zh` → nothing). The stored question and the UI never show the suffix. `Deps` gains `locale?: MiroFishLocale`; the worker passes it. Report follow-ups (`report.chat`) get the same suffix.
- **Resumable stream.** The projector writes a `data-cursor` part (`id: 'cursor'`, `data: { seq }`, transient: not persisted, excluded from the message-parts whitelist) after each batch of events; the stream route accepts `?after=<seq>` and the tail starts from it; the client keeps the last seen seq in a ref (from the cursor parts) and passes it in `prepareReconnectToStreamRequest`; a reconnect therefore only appends what is new and never rewrites existing parts. The interview send path no longer calls `resumeStream()` when a stream is already live; it relies on the live tail. `router.refresh()` after a retry stays.

## Tasks

### Task A: Interview and follow-up language instruction (engine + worker + web)
- Modify: `packages/engine/src/orchestrator/types.ts` (`Deps.locale?`), `packages/engine/src/follow-up/language.ts` (new: `languageInstruction(locale)`, `withLanguage(prompt, locale)`), `packages/engine/src/orchestrator/stages/interviews.ts` (prompt), `apps/web/src/server/follow-up.ts` (report chat message), `apps/worker/src/main.ts` (pass `env.MIROFISH_LOCALE`), `packages/engine/src/index.ts` (export), tests in engine (`language.test.ts`, machine test asserting the interviewBatch prompt ends with the suffix and the stored question does not) and web (follow-up test asserting the chat message carries the suffix).
- Commit: `fix(engine,web): interview and follow-up prompts ask for the configured language`

### Task B: Graph visualisation
- Modify: `apps/web/src/modules/chat/parts/graph-preview.tsx` (+test), `packages/engine/src/orchestrator/mirofish-map.ts` (MAX_NODES 400, degree-first sampling, +test). Add `components/ui/switch.tsx` via `pnpm dlx shadcn@latest add switch` from `apps/web` if absent (a `dialog.tsx` exists).
- Tests: legend lists the types with colours; toggle flips edge labels; fullscreen opens a dialog with the canvas; palette assignment is stable; sampling keeps high-degree nodes; axe.
- Commit: `feat(web): knowledge graph with labels, type colours, legend, edge labels, refresh and fullscreen`

### Task C: Resumable stream
- Modify: `packages/engine/src/projector/tail.ts` (`afterSeq` input, cursor part), `packages/engine/src/parts.ts` (cursor part type, not in persisted whitelist), `apps/web/src/server/ui-message.ts` (drop cursor on load), `apps/web/src/app/api/chats/[id]/stream/route.ts` (`after` query), `apps/web/src/modules/chat/chat.tsx` (cursor ref, reconnect request with `after`, no resume on interview send while streaming), tests for each.
- Tests: tail from `after` emits only newer events and a cursor per batch; route validates `after` as a non-negative integer; chat test: a reconnect after a stream end requests `?after=<last seq>` and existing text parts are untouched; interview send while streaming does not call resumeStream.
- Commit: `fix(engine,web): resume the run stream from the last seen event instead of replaying it`

### Task D: Verification on the mock and real stacks (graph at 390px too), fix visual defects, docs note, gates.
