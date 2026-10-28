# Product guide implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A four-step animated guide dialog that opens once on first visit, can be reopened from a header question-mark button, and shows the product in motion using its own components.

**Architecture:** `GuideProvider` (client, in the chat layout) owns the open state, the first-visit check against `localStorage['xo.guide.v1']`, and renders `GuideDialog`. Four scene components under `modules/guide/scenes` animate on a shared `useSceneClock` that only ticks while the dialog is open, the step is active and reduced motion is off. The ReUI `stepper` primitive is installed through the registry.

**Tech Stack:** Next 16, React 19, Radix Dialog (existing `components/ui/dialog.tsx` with the blurred overlay), ReUI `stepper`, existing primitives, Vitest + Testing Library + vitest-axe.

**Spec:** `docs/superpowers/specs/2026-10-28-product-guide-design.md`

## Global Constraints

- Storage key exactly `xo.guide.v1`, value `seen`, written on every close path.
- Copy exact: hidden title "How Xenet Opinions works"; steps 1–4 titles and sentences as in the spec; header button `aria-label` and tooltip "How it works"; buttons "Back", "Next", "Done".
- Auto-open only on pathname `/`, only when the key is absent, only after mount; never when another dialog is open (check `document.querySelector('[role="dialog"]')` is null at the moment of auto-open).
- Scenes: no `setInterval`/`setTimeout` while the dialog is closed or the step is inactive; `prefers-reduced-motion: reduce` renders each scene's final frame.
- Only existing primitives plus `@reui/stepper`. Comments only for invariants. Gates green per task.

## Review Focus

1. First visit on a thread deep link does not auto-open; the next visit to `/` does. (Task 2 tests)
2. Closing with Escape or the backdrop writes the key, same as Done. (Task 2 tests)
3. Timers stop on close and on step change; no React act warnings; reduced motion shows static scenes. (Task 1 tests)
4. The sign-in dialog and the guide never stack: opening the guide while sign-in is open is refused, and auto-open is skipped while `?signIn=1` is being handled. (Task 2 test)
5. Keyboard: arrows switch steps, Tab order is close → scene (inert) → stepper → Back/Next. (Task 2 axe + test)

---

### Task 1: Scene clock and the four scenes

**Files:**
- Install from `apps/web`: `pnpm dlx shadcn@latest add @reui/stepper` → `components/ui/stepper.tsx` (format with Biome, strip comments).
- Create: `apps/web/src/modules/guide/use-scene-clock.ts` (+test), `apps/web/src/modules/guide/scenes/{ask,watch,interview,report}.tsx`, `scenes/scene.tsx` (shared 16:9 stage with `aria-hidden`), `scenes/scenes.test.tsx`

**Interfaces:**
- `useSceneClock({ active, steps }: { active: boolean; steps: number[] }): number` returns the current phase index; advances through `steps` (ms per phase) with `setTimeout`, loops, resets to 0 when `active` turns false, and returns `steps.length - 1` (final frame) when reduced motion is preferred (`window.matchMedia('(prefers-reduced-motion: reduce)')`).
- `AskScene({ active })`, `WatchScene({ active })`, `InterviewScene({ active })`, `ReportScene({ active })`: each renders inside `<Scene>` and derives everything from the phase index; typing effects slice a constant string by phase.

- [ ] **Step 1:** `use-scene-clock.test.ts` with fake timers: advances per step; loops; inactive → 0 and no pending timers; reduced motion → last index immediately; unmount clears timers. Implement.
- [ ] **Step 2:** scenes per the spec's descriptions; `scenes.test.tsx`: each scene renders at phase 0 and at its last phase with the expected text (the typed question, "Round 2 of 3", two pressed persona cards, the follow-up bubble), is `aria-hidden`, and passes axe; with reduced motion the final frame renders without timers.
- [ ] **Step 3:** gates; commit `feat(web): guide scenes built from the product's own components`.

---

### Task 2: Guide dialog, provider, header button, first-visit logic

**Files:**
- Create: `apps/web/src/modules/guide/guide-dialog.tsx` (+test), `guide-provider.tsx` (+test), `guide-steps.ts` (copy), `apps/web/src/modules/chat/header/guide-button.tsx` (+test)
- Modify: `apps/web/src/app/(chat)/layout.tsx`, `apps/web/src/modules/chat/header/chat-header.tsx` (+test), `apps/web/src/modules/auth/sign-in-dialog.tsx` only if a shared "a dialog is open" signal is needed, `README.md` (one sentence under "Run it": a short guide opens on first visit and from the ? button)

**Interfaces:**
- `GUIDE_STEPS: { title: string; body: string; Scene: ComponentType<{ active: boolean }> }[]`.
- `GuideDialog({ open, onOpenChange })`: stepper + scene + copy + Back/Next/Done; arrow keys change step; `onOpenChange(false)` on Done.
- `GuideProvider({ children })` + `useGuide(): { open: () => void }` (no-op outside); `markGuideSeen()` and `hasSeenGuide()` helpers around `localStorage` (guarded for SSR and storage errors).
- `GuideButton()` renders the ghost icon button calling `open()`.

- [ ] **Step 1:** tests: provider auto-opens on `/` when unseen and writes `seen` on close (Done, Escape, overlay); does not auto-open on `/c/x` or when seen or when a dialog is already in the DOM; `open()` works anywhere; dialog: four steps, Next/Back/Done, arrow keys, stepper click, axe; header: button present before the account menu with the exact label.
- [ ] **Step 2:** implement; wire the provider in the layout and the button in the header.
- [ ] **Step 3:** Browser check on the dev stack: clear storage → `/` opens the guide; watch all four scenes loop; Escape closes; reload → no guide; `?` reopens; dark mode; reduced motion via DevTools emulation shows static frames. Screenshots of each step to `.context/guide-step-N.jpg`.
- [ ] **Step 4:** gates; commit `feat(web): first-visit product guide with a header help button`.
