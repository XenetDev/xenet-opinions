# Sidebar with chat history: design

Addendum to `docs/superpowers/specs/2026-10-19-xenet-opinions-design.md`. **Owner (2026-10-29):** the product looks bare. Bring back a left sidebar built on ReUI's `app-shell-21` block: the Xenet logo, New chat, search through a command palette, the chat history, and a footer card with the user's usage, instead of the chat-history dropdown in the header. Approved from a mockup (`.superpowers/brainstorm/38779-1793249157/content/sidebar.html`).

## Intent

The chat list is the user's memory of what they have asked and what is still running. Today it hides behind a dropdown in the header, the home page shows four recent chats, and usage sits in a thin line above the composer. A persistent sidebar puts all of that in one place, gives the app a frame, and makes room for later sections (artifacts, documents).

## Goals

- A left sidebar on every chat page: brand row, New chat, Search, the chat history grouped by day, and a footer with the usage card, theme, the guide button and the account row.
- The header shrinks to the chat title, the Working badge and the chat options menu; on mobile it gains a menu button that opens the sidebar as a sheet.
- Search opens a command palette (⌘K): type to filter chats by title, Enter opens one, with "New chat" always available.
- The sidebar collapses to an icon rail on desktop and remembers its state; it is a slide-over on mobile.
- Guests see their device's chats, the one-run quota and a Sign in button in the usage card; signed-in users see their quota and the account row.

## Non-goals

- Pinned chats, projects, workspaces, a model picker, an artifacts tab: those belong to the ReUI demo, not to Opinions. The sidebar structure must leave room for an artifacts section later.
- Renaming or deleting chats from the sidebar beyond what the existing chat options menu does (it stays in the header).
- A resizable sidebar. The block's drag-to-resize is dropped; fixed width plus collapse is enough.

## Anti-goals

- A sidebar that pushes the composer off a 375 px phone, or covers the thread on tablets by default.
- Two sources of truth for the chat list: the sidebar must read the same `ChatListProvider` the header reads today, so a run that starts or finishes updates the list in place.
- Losing the running indicator: a chat whose run is queued or running is marked in the sidebar as it is in the dropdown today.

## Decisions

- **Block.** Install `@reui/app-shell-21` through the registry into `components/blocks/app-shell-21`, then move what is used into `modules/chat/shell/` and delete the rest (demo data, model picker, workspaces, artifacts tab, resizable panels, placeholders). The block brings `sidebar`, `resizable`, `item`, `toggle-group`, `use-mobile` and `empty` from shadcn; keep `sidebar`, `item`, `use-mobile`, `empty`, remove `resizable` and `react-resizable-panels` if nothing else uses them.
- **Layout.** `app/(chat)/layout.tsx` wraps the page in `SidebarProvider` with the sidebar on the left and the existing header plus `main` on the right. Collapsed state persists in the `sidebar_state` cookie the shadcn sidebar already uses, read on the server so the first paint is right.
- **Sidebar, top to bottom (exact).**
  1. Brand row: `XoMark` and "Xenet Opinions" (links to `/`), then the collapse toggle.
  2. "New chat" button (primary, full width, Lucide `Plus`, shortcut `⌘⇧O`).
  3. "Search chats" row (ghost, Lucide `Search`, `⌘K` kbd) opening the palette.
  4. History: groups "Today", "Yesterday", "Previous 7 days", "Previous 30 days", then month names ("October 2026"), newest first, empty groups omitted. Each row: title (or "New conversation"), truncated, `aria-current="page"` on the active chat, a small pulsing dot with `aria-label="Working"` when the run is queued or running. Empty state: "No chats yet" and, for guests, "Chats on this device only. Sign in to keep them."
  5. Footer: usage card, then "Theme" (cycles light, dark, system), "How it works" (opens the guide), then the account row (avatar, name, email, menu with Sign out and Delete account) or nothing for guests, since the Sign in button lives in the usage card.
- **Usage card (exact copy).** Title "Runs today", value `{used} of {max}`, second line `Resets {resetLabel}` or `No runs left until {resetLabel}` (reuse `resetLabel`), and for guests when sign-in is available a third line "Sign in for {n} runs a day" as a full-width "Sign in" button. A thin progress bar under the value. The usage bar above the composer is removed. Usage comes from the same `getUsage` call the home page makes today, passed to the layout; it refreshes after a run is accepted via the existing chat-activity events.
- **Rail.** Collapsed: logo, New chat, Search and the account avatar as icon buttons with tooltips; history and the usage card hidden.
- **Mobile (< 768 px).** No rail. Header shows a menu button (Lucide `PanelLeft`, `aria-label="Open sidebar"`) that opens the sidebar as a `Sheet` from the left; choosing a chat closes it.
- **Header.** `ThreadSwitcher` and the "+" button are removed; the title is plain text. The Working badge and `ChatOptions` stay. Theme, guide and account controls move to the sidebar.
- **Home page.** The "Recent chats" section is removed from `Welcome`; starters stay. `page.tsx` no longer builds `recent`.
- **Palette.** `CommandDialog` from `components/ui/command` (already installed), opened by the Search row and `⌘K`/`Ctrl+K`. Groups: "Actions" with "New chat", and "Chats" filtered by title as the user types (case-insensitive substring; no server call). Selecting navigates and closes.
- **Chat list.** `ChatListProvider` stays the single source. The layout already loads the list server-side; grouping by day happens in the sidebar with the same `startOfDay` helper the switcher used.

## Constraints

- Only shadcn/ReUI primitives already in the repo plus what the block brings. Strict TypeScript, Biome, comments only for invariants, axe clean in jsdom, gates green per task.
- Keyboard: Tab order brand → New chat → Search → history rows → footer; Escape closes the palette and the mobile sheet; focus returns to the trigger.
- `prefers-reduced-motion` disables the collapse animation and the pulsing dot.

## Calls made after the builder check (mine, not the owner's)

- **Usage refresh.** The layout calls `getUsage` and seeds a small `UsageProvider`; `Chat` bumps it optimistically where it bumped its local state before, and the `router.refresh()` that already fires when a run is accepted re-reads the real value. `usage` and `signIn` props disappear from the pages, `HomeChat`, `Chat` and `BoxComposer`; `page.tsx` and `c/[id]/page.tsx` stop calling `getUsage`. Quota refusals stay server-side with the existing toast.
- **Guests.** `getSessionUser` returns the anonymous user, so the card renders for guests with `limits.anonymous`; it is hidden only when there is no session yet. The "Sign in" button and the "Sign in for {n} runs a day" line appear only when `limits.anonymous && limits.demoMode && signInAvailable()`.
- **Account row.** The existing `AccountMenu` (session hook, sign-out, delete-account dialog and its tests) is re-skinned into the sidebar row; the block's `nav-user.tsx` is a styling reference only. In the rail a signed-in user sees the avatar; a guest sees a Lucide `LogIn` icon button when sign-in is available, else nothing.
- **Day grouping.** Done on the client after mount with the client's clock; before mount the history area shows skeleton rows (the sidebar persists across navigations, so this happens once per load). Rows are sorted by `updatedAt` descending inside the sidebar regardless of provider order. `chatTitle`, `isRunning` and the grouping helper move to `modules/chat/shell/chat-meta.ts` with tests.
- **Palette.** Repo `CommandDialog` with `shouldFilter={false}`; chats filtered manually (case-insensitive substring on title, at most 50 shown, newest first). "New chat" is always rendered above the results. The block's `chat-search-dialog.tsx` is reference only.
- **Shortcuts.** `⌘K`/`Ctrl+K` opens the palette, `⌘⇧O`/`Ctrl+Shift+O` starts a new chat, shadcn's `⌘B` keeps toggling the sidebar; all three work while the composer has focus. The palette is the only one that preventDefaults.
- **Collapsed by default below 1024 px** when no `sidebar_state` cookie exists; otherwise follow the cookie. Mobile (< 768 px) is always the sheet.
- **Running indicators.** The header's Working badge shows on mobile too (drop `max-md:hidden`). The sidebar dot for the active chat uses `activity.running || isRunning(runStatus)`, other rows `isRunning(runStatus)`. The live step text from the old switcher is dropped.
- **Block files.** Install `@reui/app-shell-21` once to pull `sidebar`, `item` and `use-mobile` into `components/ui` and `hooks`; do not overwrite existing `components/ui` files (`empty`, `tooltip`, etc.); skip `toggle-group`, `resizable` and `react-resizable-panels`; delete the block folder after the parts are moved. `thread-sidebar.tsx` is the structural reference for the history list and footer.
- **Tests.** Header tests covering moved controls are ported to the new sidebar, palette and usage-card tests rather than deleted.

## Left to the builder

- Exact widths (the block uses 248 px expanded) and the rail icon size.
- Whether the day grouping lives in a small pure helper with tests (recommended) or inline.
- Relative time in rows: the mockup shows none; add it only if rows stay on one line.
