# ReUI chat round 2 implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the owner's round-2 feedback: Copilot Shell header and thread switcher instead of the sidebar, a boxed composer with a visible pause toggle, the Copilot Shell starter view on the home page, mobile typography, and no raw tool output.

**Architecture:** Client-only under `apps/web/src` plus one small server addition (first uploaded file name on the chat summary). Reference markup in `.context/reui-blocks/ai-chat-1/components/{ai-chat,composer,chat-thread}.tsx` (read-only; never import). Round-1 modules stay: console, thread, composer, home.

**Tech Stack:** as round 1.

**Spec:** `docs/superpowers/specs/2026-10-28-reui-chat-design.md`, section "Round 2".

## Global Constraints

- Round-1 Global Constraints still apply (exact strings, data parts read-only, reduced motion, axe tests, gates green per task, no comments).
- New exact strings: attach item "Upload files" with hint "PDF, Markdown, text"; pause chip "Pause for interviews"; rounds chip `{n} rounds` (`1 round`); header switcher title on the home page "New chat"; tabs "All", "Today", "Earlier"; menu items "Rename", "Delete"; home heading "Recent chats".
- Never import from `.context/reui-blocks`.

## Review Focus

1. Home: starters fill, never send; send still creates the chat lazily and lands on `/c/:id` (round-1 RF2 unchanged). (Task 3)
2. Switcher: the running chat's row shows the live step; selecting a chat navigates; "+" goes to `/`; Rename and Delete still work from the header. (Task 2)
3. Composer: pause toggle state reaches `runOptions.pauseForInterviews`; rounds chip reaches `maxRounds`; Stop/Send slot and IME behaviour unchanged. (Task 1)
4. No raw summaries: no `report_event.summary` text rendered anywhere; live line is friendly. (Task 4)
5. Mobile at 390px: no horizontal scroll, composer and header fit, body text 14px. (Task 5)

---

### Task 1: Boxed composer with toolbar
- Modify: `modules/chat/composer/pill-composer.tsx` (rename to `box-composer.tsx`, keep the `Composer` export via `composer.tsx`), `composer/chips.tsx`, `composer/run-options.tsx` (pause toggle chip + rounds chip; delete the dropdown checkbox item), tests.
- [ ] Tests first: placeholder visible with consistent left inset in all three modes (textarea has `px-3`/`py-3`; no `order-first` tricks); pause chip toggles `aria-pressed` and sends `pauseForInterviews`; chip shows a check icon when on; rounds chip menu 1..max; attach menu item text and hint; chips above the textarea with remove; Stop replaces Send while busy/streaming; IME 229; Enter/Shift+Enter; axe all modes.
- [ ] Implement with `Frame dense spacing="sm"` + `FramePanel p-0` + `InputGroup className="border-0 bg-transparent shadow-none"`, textarea `field-sizing-content max-h-48 min-h-16 px-3 py-3`, `InputGroupAddon align="block-end"` toolbar.
- [ ] Commit `feat(web): boxed composer with attach menu, pause toggle and rounds chip`

### Task 2: Header with thread switcher; remove the sidebar
- Create: `modules/chat/header/chat-header.tsx`, `header/thread-switcher.tsx`, tests.
- Modify: `app/(chat)/layout.tsx` (header replaces `SidebarProvider`/`AppSidebar`/`SidebarTrigger`; `main` is `flex min-h-0 flex-1 flex-col`), `chat.tsx` / `home-chat.tsx` (provide title, running state and live step to the header through a small context or props), `modules/sidebar/*` → keep `chat-list-context.tsx` (move to `modules/chat/chat-list-context.tsx`), reuse `rename-dialog.tsx` and the delete flow, delete `app-sidebar.tsx`, `chat-list.tsx`, `chat-item.tsx` and `components/ui/sidebar.tsx`; update tests.
- [ ] Tests first: switcher lists chats under Today/Earlier by `updatedAt`; the active chat's row has `aria-current` and shows the live label with a spinner while running; selecting navigates; "+" navigates to `/`; options menu Rename opens the dialog and Delete removes and navigates home; axe.
- [ ] Commit `feat(web): Copilot Shell header with thread switcher replaces the sidebar`

### Task 3: Copilot Shell starter view on the home page
- Modify: `modules/chat/home/welcome.tsx` (+test), `server/chats.ts` (`ChatSummary.firstFile?: string` from the first upload of the chat), `app/(chat)/page.tsx`.
- [ ] Tests first: heading and line; three starter rows with the return glyph that fill the composer; "Recent chats" rows (≤4) with title, file badge when present, relative time; axe.
- [ ] Commit `feat(web): Copilot Shell starter view with recent chats`

### Task 4: Typography and no raw tool output
- Modify: `console/derive.ts` + `rows.tsx` (drop `detail` from tool rows; live line friendly labels: tool_call → `TOOL_TITLES[toolName]`, section → "Writing <title>", else "Planning the report"), `markdown.tsx` (heading scale), `thread/turn.tsx`, `parts/interview-card.tsx`, `message-parts.tsx` (`text-sm/6 sm:text-[15px]/6`); tests.
- [ ] Tests first: no `summary` text in the console DOM for tool events; live line equals the friendly label; markdown headings carry the responsive classes.
- [ ] Commit `fix(web): friendly report step labels, no raw tool output, mobile type scale`

### Task 5: Verification
- [ ] Mock stack in the browser at desktop and 390px: home, switcher, composer in all modes (pause chip on/off, rounds), a paused run, report, follow-up; real stack: one ticked 1-round run, confirm no Chinese anywhere in the console. Screenshots `.context/reui2-home.jpg`, `reui2-run.jpg`, `reui2-mobile.jpg`. Fix visual defects in `fix(web)` commits. Gates. Append "## ReUI chat round 2 verification" to `docs/superpowers/plans/2026-10-23-phase-5-followups.md`; commit `docs: ReUI chat round 2 verification notes`.
