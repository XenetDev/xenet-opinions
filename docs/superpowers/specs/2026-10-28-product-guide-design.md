# Product guide: design

Addendum to `docs/superpowers/specs/2026-10-19-xenet-opinions-design.md`. **Owner (2026-10-28):** first-time visitors need to see what the product does and how to use it, in a few short animated steps, in a dialog they can close for good and reopen from a question-mark icon in the header. The product must not feel complicated on first contact.

## Intent

Xenet Opinions runs a multi-stage simulation behind a chat. New visitors do not know that they can attach documents, that personas can be interviewed before the report, or that the report answers follow-ups. A four-step guide shows each in motion using the product's own components, so the demo always matches the product.

## Goals

- On a visitor's first visit, a guide dialog opens over the home page with four steps, each a short looping animated scene built from the app's real components, a title and one sentence.
- Closing the guide (Done, the close button, Escape, or the backdrop) marks it seen; it never opens by itself again on that browser. A question-mark button at the far right of the header, before the sign-in or account control, reopens it at any time.
- Steps are navigable with Next/Back, the stepper dots, and the arrow keys; the dialog is accessible (labelled, focus trapped, Escape closes); reduced motion shows the final frame of each scene instead of animating.
- Light and dark mode both look right; no images, video or GIF files are shipped.

## Non-goals

- Spotlight tours that attach to live UI elements; per-page tips; server-side tracking of who has seen the guide.
- Recorded screen captures. The scenes are code; a later change may swap in recordings without touching the dialog.

## Anti-goals

- A guide that opens on every visit, or blocks the composer behind it when the visitor has already dismissed it.
- Scenes that diverge from the product (different copy, controls or states than the app ships).
- Any scene that spends CPU while the dialog is closed.

## Decisions

- **Trigger.** `localStorage['xo.guide.v1'] === 'seen'` suppresses the auto-open; the value is written when the dialog closes by any means. The key carries a version so a later guide can show again. Auto-open happens once on the home page after hydration (never on a thread page, never while another dialog is open); the header button opens it anywhere.
- **Dialog.** The existing `Dialog` with the blurred overlay used by sign-in, `sm:max-w-[40rem]`, a scene area with a fixed 16:9 aspect, below it the step title and sentence, the ReUI `stepper` (four steps, clickable), Back / Next buttons and "Done" on the last step. Hidden `DialogTitle` "How Xenet Opinions works".
- **Steps and copy (exact).**
  1. "Ask a question" — "Describe a decision and who it affects. Attach documents for the best results, or just ask."
  2. "Watch the simulation unfold" — "A knowledge graph, generated personas, and a simulated public on Twitter and Reddit, round by round."
  3. "Interview the personas" — "Pause before the report, pick up to five personas and ask them anything."
  4. "Read the report, keep asking" — "A prediction report with its sources. Ask follow-up questions any time."
- **Scenes** (`modules/guide/scenes/*.tsx`, pure client components, loop every 8 to 10 seconds, driven by one `useSceneClock(stepCount, durations)` hook that pauses when `prefers-reduced-motion` matches, when the dialog is closed, or when the step is not active):
  1. *Ask*: a miniature of the real composer (`InputGroup`, pill, "+" and rounds controls) in which a starter question types itself, a `seed`-less document chip appears, and the send button pulses.
  2. *Watch*: a miniature run console (`Frame`, rows with `Spinner`, check marks) stepping through "Reading your documents", "Building the knowledge graph", "Generating personas", "Running the simulation" with a "Round 2 of 3" detail, then a 3×2 grid of persona initials fades in.
  3. *Interview*: four persona cards, two get the pressed state one after the other, chips appear above a mini composer, "Ask the selected personas…" types, and one answer bubble appears under the first card.
  4. *Report*: a mini report with a heading and three lines that stream in, two source chips, then a follow-up bubble "Which segment is most at risk?" and a short reply.
- **Header.** `GuideButton`: ghost `icon-sm` button with Lucide `CircleHelp`, `aria-label` "How it works", tooltip "How it works", placed immediately before `AccountMenu`.
- **State.** `GuideProvider` (client) mounted in the chat layout exposes `useGuide(): { open: () => void }`; the dialog lives in the provider; `HomeChat` calls nothing (the provider itself auto-opens on the home pathname when unseen).

## Constraints

- Only existing primitives (`Dialog`, `Frame`, `Badge`, `Spinner`, `InputGroup`, `Bubble`, `Avatar`, `Button`, `Attachment`) plus the ReUI `stepper` added through the registry.
- Strict TypeScript, Biome, comments only for invariants, axe clean in jsdom, `pnpm lint/typecheck/test/build` green.
- No timers run while the dialog is closed; `motion-reduce` is honoured.

## Left to the builder

- Exact timings per scene within the 8–10 s loop; the easing classes.
- Whether scenes share a `MiniComposer` component or inline their own markup.
- Tooltip placement for the header button.
