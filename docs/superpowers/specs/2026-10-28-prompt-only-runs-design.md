# Prompt-only runs: design

Addendum to `docs/superpowers/specs/2026-10-19-xenet-opinions-design.md`. **Owner (2026-10-28):** a run must not require a document; when the prompt lacks the context a simulation needs, ask for it with the existing "Needs you" step; otherwise just run.

## Facts

MiroFish's ontology endpoint (pinned commit `7657031`) rejects a request with no files ("Please upload at least one document file") and accepts `simulation_requirement` plus an optional `additional_context` form field. Its own UI turns pasted text into a file. The simulation quality depends on the seed carrying background, the actors to simulate and the change being tested.

## Goals

- A run starts from a prompt alone. The app writes a seed document from the prompt (and any answers) and MiroFish receives it as a normal file.
- When the prompt is short and no document is attached, the thread asks three optional questions in a "Needs you" card before starting: background and constraints, who should be simulated, what is changing. Long prompts and document runs start immediately.
- No quota is consumed and no rows are created until the user confirms (or skips) the questions; abandoning the card leaves nothing behind.
- The seed shows as the run's source (`seed.md`) so reloads, the sidebar and the sources chips look like any document run.

## Non-goals

- An LLM judging whether the prompt is sufficient. The trigger is a word count.
- Editing the seed after the run starts; interviewing the seed.
- Changing MiroFish or the worker's stage machine.

## Anti-goals

- Burning a run on a prompt that MiroFish will reject.
- A card that blocks document runs or long prompts.
- Persisting a half-filled questionnaire server-side.

## Decisions

- **Trigger.** `SEED_PROMPT_MIN_WORDS = 40` (exported from `packages/engine/src/policy/seed.ts`). The card appears when `uploadIds.length === 0 && wordCount(text) < 40`. Otherwise the send goes straight out; the server seeds from the prompt alone when there are no uploads.
- **Request shape.** `POST /api/chats/:id/messages` run branch: `uploadIds` may be empty; new optional `seed: { background?: string; actors?: string; change?: string }`, each trimmed, max 2000 characters. `files_required` is removed. When `uploadIds` is empty the route, after the quota check and `ensureOwnedChat`, writes the seed document through the storage adapter as an upload row (`filename: 'seed.md'`, `mediaType: 'text/markdown'`, owned by the user and chat) and starts the run with that upload id. Server-side `buildSeedDocument({ question, background?, actors?, change? })` in `packages/engine/src/policy/seed.ts` produces:

  ```
  # Scenario

  <question>

  ## Background and constraints
  <background or "Not provided.">

  ## Who is involved
  <actors or "Not provided.">

  ## What is changing
  <change or "Not provided.">
  ```

- **Client.** In run mode, when the trigger fires, the composer's send becomes a pending run held in `Chat` state: the thread renders the user's bubble and a `ContextCard` (same `Frame` + "Needs you" badge language as the interview window) with the three optional textareas and two buttons, "Start run" (primary) and "Skip and run with my question". Both call `sendMessage` with the pending text and `runOptions`, plus `seed` when any field has text. The composer stays usable; a new send replaces the pending run. Reload drops the pending card (client state only). In `new` mode the URL swap and sidebar entry happen on acceptance as today.
- **Copy (exact).** Card title "A little more context helps the simulation"; subtitle "Optional. MiroFish simulates better when it knows the situation."; labels "Background and constraints", "Who should be simulated", "What is changing"; placeholders "The rules, numbers and history that matter", "Customers, staff, competitors, the press…", "The decision or event you want to test"; buttons "Start run", "Skip and run with my question".
- **Sources.** The seed upload is listed in `data-sources` like any file; the chip reads `seed.md`.
- **Docs.** README: runs work from a prompt alone; attach documents for real decisions. hosting.md policy bullet updated (a document is no longer required).

## Constraints

- All existing tests keep passing; document runs are byte-for-byte unchanged in behaviour.
- Strict TypeScript, Biome, comments only for invariants.

## Left to the builder

- Whether the card lives in `modules/chat/parts/context-card.tsx` or under `composer/`.
- Textarea heights and whether Enter submits inside the card (Shift+Enter should insert a newline either way).
