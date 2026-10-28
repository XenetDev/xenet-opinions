# Xenet Opinions chat UI on ReUI: design

Addendum to `docs/superpowers/specs/2026-10-19-xenet-opinions-design.md` with the decisions taken on 2026-10-28. The owner skipped the design conversation and asked for best practice with three named ReUI blocks; every decision below is the builder's call unless marked **owner**.

## Intent

The chat looks unfinished: a bare welcome page with suggestion pills, tool calls stacked as touching bordered cards, no motion while the run is working, a composer that is a plain box. **Owner:** replace the welcome screen with ReUI's Prompt Starter Welcome (`ai-chat-3`), the conversation with ReUI's Branching Thread look (`ai-chat-9`), the pipeline and report progress with ReUI's Agent Activity console (`agent-activity-1`), and wire the real run (stages, tool calls, interviews, thinking states, animations) into them so the whole product reads as one system. **Owner:** the first screen must have the chat input on it; nobody should click "New conversation" first.

## Goals

- One visual system: ReUI primitives (`Message`, `Bubble`, `Marker`, `Frame`, `Attachment`, `Empty`, `InputGroup`, `Spinner`, `Badge`) everywhere in the chat; no AI Elements left in the chat after this.
- The run reads as work in progress: a live row with a spinner and shimmer, finished rows with elapsed time, queued rows with dashed rings, rows that animate in. Tool calls are rows, not cards; nothing touches or overlaps.
- The home page is a working chat: greeting, starters that fill the composer, recent conversations to resume, and a docked composer that starts a run directly.
- Every existing behaviour survives: uploads, rounds, pause for interviews, the interview window with persona selection and Generate report, cancel, retry, follow-ups, reload mid-run, demo quotas and the kill switch, keyboard and screen-reader access (axe tests stay).

## Non-goals

- Branching, regenerate, edit-and-fork, votes, model picker, effort levels, skills menu, questionnaire, copy-link: parts of `ai-chat-9`/`ai-chat-3` with no counterpart in this product. They are not built.
- Dark mode and theming beyond what ReUI's tokens add. The app stays light by default.
- Changing the engine, the data parts, the routes or the stream contract. This is a client change under `apps/web/src`.
- Shipping ReUI's demo code. The blocks' canned-data components are references, not product code.

## Anti-goals

- A home page that creates an empty chat row before the user has said anything.
- Progress that stops moving: a step that is running must always show motion.
- Regressions in the existing component tests' coverage of behaviour (they may be rewritten for new markup; they may not be deleted without a replacement).

## Decisions

- **Install ReUI through the shadcn registry, keep the primitives, rebuild the screens.** `apps/web/components.json` gets the `@reui` registry; the licence key lives in `apps/web/.env.local` (`REUI_LICENSE_KEY`, git-ignored; CONTRIBUTING documents it). The three blocks were installed once to obtain the primitives (`components/ui/{attachment,bubble,card,empty,field,kbd,label,marker,message,message-scroller,popover,progress}.tsx`, `components/reui/{badge,frame,icon-stack,icon-tile}.tsx`) and the ReUI theme tokens in `globals.css`. The block screens themselves (`components/blocks/*`) are moved to `.context/reui-blocks/` as read-only references: they are demo code driven by canned data, they do not compile under the repo's `noUncheckedIndexedAccess`, and ~70% of each is behaviour this product does not have. The product screens are written in `modules/chat` using the same primitives and the same markup patterns, so they look like the blocks and read like this codebase. `components/reui/code-block`, `ui/questionnaire.tsx` and `ui/svgs/` are removed (unused; the first does not compile). Kept ReUI files are formatted with Biome once.
- **Home page = Prompt Starter Welcome.** `/` renders the greeting ("Xenet Opinions", one line: "Ask how a group of people would react to a decision"), a "Start" rail of three starters (each with a Lucide icon; selecting one fills the composer, never sends), a "Resume" rail of the user's recent conversations (title, relative time; up to 5, from the same list the sidebar shows) and the docked pill composer. The composer is the same component as in the chat. Sending from the home page creates the chat (`POST /api/chats`), uploads the attached files to it, posts the run, then navigates to `/c/:id`, where the page resumes the stream as it does after a reload. Attaching a file on the home page creates the chat at that moment (uploads need a chat id) and keeps the id in state. The sidebar's "New conversation" navigates to `/` and creates nothing.
- **Thread = Branching Thread look.** `MessageScrollerProvider autoScroll` + `MessageScroller` + viewport fade + scroll-to-bottom button. A date `Marker variant="separator"` at the top. User turns: `Bubble variant="muted" align="end"` at most 85% wide, with `Attachment` chips above showing the uploaded files (from the run's `sources` part, so they survive reload). Assistant turns: `Message` with a `MessageHeader` ("Xenet Opinions · HH:MM"), content in `Bubble variant="ghost"`; body text is the existing streamdown renderer at `text-[15px]/6`. Follow-up answers and interview answers are assistant turns. No footers, no action reveals.
- **Run console = Agent Activity.** One `Frame` per run inside the assistant turn, title = the question's first 60 characters, status `Badge` (Working / Needs you / Complete / Failed / Cancelled). Rows, from the `stage` parts: done rows (check glyph, title, elapsed `m:ss` from stage timestamps when known), one live row on a `bg-muted/50` band (`Spinner` glyph, shimmer label, the stage's latest message as the second line, indeterminate `Progress` bar while the stage reports no percent; the simulation stage shows round `n of m`), queued rows (dashed ring). The report stage expands in place: each outline section is a sub-row, and each report tool call is a row with a `ServerChip` naming the tool (`insight_forge`, `panorama_search`, `interview_agents`), a spinner while running and a check with elapsed time when done; the tool's summary is a collapsible note on the row. The interview window is the console's "Needs you" state: the live band shows "N personas online until HH:MM" with the countdown, the Generate report and Cancel run actions sit in the band's action slot, and the status badge reads "Needs you". The queue card becomes a queued row ("Waiting for a free slot, #N in queue"). Errors render as a failed row with the message and the Retry button in the action slot. The footer reads "Step n of 7 · m:ss"; once the report text arrives the finished rows fold behind a "Finished · 7 steps" row (the fold the block ships), so the report is the first thing on screen.
- **Rich parts stay, restyled.** Ontology → a reasoning-disclosure row under the console ("What I found in your documents", brain icon, chips inside). Graph preview → `Frame` with the node/edge counts in the header. Persona roster → `Frame` with the count in the header and the existing selectable cards inside (selection behaviour unchanged). Simulation feed → `Frame` with platform `Tabs` in the header and posts as `Bubble variant="outline"` rows with the persona's initials in a `MessageAvatar`. Interview answers → one assistant turn per question: the question as a muted user bubble, then one `Message` per persona with `MessageAvatar` initials and a ghost bubble; pending = `Spinner` + shimmer "Thinking", failed = `Alert`. Sources list → `Attachment` chips on the user turn (above).
- **Composer = the welcome block's pill.** `InputGroup` rounded-full, auto-growing textarea (min one line, max 10rem), "+" button at the inline start opening a menu: Attach files (`.pdf .md .txt`, triggers the hidden input), and in run mode a "Pause for interviews before the report" checkbox item (hidden when `DEMO_ALLOW_PAUSE=0`); at the inline end a "N rounds" ghost dropdown (1 to `DEMO_MAX_ROUNDS`, default 3) in run mode, then Send (arrow, primary, round) or Stop (filled square) while a reply streams or a run is active. Attached files and selected personas ride above the pill as `Attachment` chips with remove buttons (the `ContextChips` pattern). Placeholders by mode: run "Ask how people would react to…", follow-up "Ask the report…", interview "Ask the selected personas…". A line under the pill: "Simulated opinions. Check important decisions with real people." Enter sends, Shift+Enter breaks the line, IME composition never sends. Validation notices (no personas selected, failed files) render as a `role="status"` line above the pill.
- **Motion rules.** Live row: `Spinner` + `shimmer` label. New rows: `animate-in fade-in-50 slide-in-from-bottom-1 duration-300`. Collapsibles: `data-open:animate-in fade-in-0 slide-in-from-top-1`. Everything honours `motion-reduce`. No `setTimeout` demo timers anywhere; every state comes from the stream or the run poll.
- **Layout.** The chat column is `max-w-3xl` centred; the composer is docked at the bottom of the `SidebarInset`; the thread scrolls, nothing else. The home page centres its content vertically while it fits (`m-auto`) and scrolls when it does not.
- **Sonner** is added once in the root layout for copy actions (copy report) and upload failures; `TooltipProvider` wraps the app in the root layout as ReUI asks.

## Constraints

- MIT clean-room for product code; ReUI files are used under the Pro licence the owner holds, which permits use in the owner's products; they are not redistributed as a library. The licence key never enters git or CI logs.
- All existing routes, data parts and stream chunks are consumed unchanged.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` (including the axe checks) and `pnpm --filter web build` stay green at the end of every task.
- Strict TypeScript: `noUncheckedIndexedAccess` is on; nothing is copied from the blocks without typing it.

## Left to the builder

- Exact icon choices for the starters and the stage glyphs.
- How elapsed time is derived per stage (stage part timestamps vs. event times) and the fallback when unknown (omit the clock).
- Whether the feed keeps its 50-post cap (yes unless it hurts) and its tab default (the run's platform).
- Test structure for the rewritten components.
