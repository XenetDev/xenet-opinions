# Report v2 and panel configuration: design

**Owner (2026-11-07):** the product is pitched to replace Toyota's focus-group programme (about $250,000 a month). Greg's feedback after two production runs: personas are now better, but the report is weak, there is no PDF, he wants far more participants, web research, a prompt enhancer and more input settings. MiroFish stays.

## Who reads it and why

The reader runs a company's focus groups. Today they recruit real people (customers and staff) to answer business questions such as "should we raise prices on model X" or "should we raise salaries". They will use the report to answer some of those questions without recruiting anyone, and forward it to someone senior. So the report must:

- read like a focus-group report, not an AI essay, or it will not be trusted as a substitute;
- survive forwarding: a summary a senior person reads in two minutes, the detail behind it, and PDF and Word copies;
- show the sample: who was "in the room" and how many;
- separate groups (owners vs prospects, dealers vs staff), because one average hides the answer;
- quote sparingly: a few telling verbatims, not one after every paragraph.

## Facts

- MiroFish's report today is free markdown with about 35 blockquotes in a 17 KB report (`report_c7b36e4b0ac9`). We render it with Streamdown; the look comes from the content, not the renderer.
- MiroFish makes one persona per person or organisation in the knowledge graph. It has no persona-count setting. Our pre-run step already drafts the cast (`apps/web/src/server/readiness/`) and named actors in that draft reliably become personas (1 node → 16 earlier this week).
- MiroFish uses one model setting (`LLM_MODEL_NAME`, now `gpt-4.1`) for the cast, profiles, simulation and its own write-up. `LLM_BOOST_*` covers only the Reddit half of the simulation.
- After the simulation the worker already pulls posts, comments, profiles (`agents`), the report outline and MiroFish's report events; interviews already exist (`stages/interviews.ts`).
- Yodoo Opinions (repo `XenetDev/yodoo`, `packages/ai/workflow/`) shows: agent-count slider 4–50, free-text audience, eight archetype chips each guaranteed one persona, Serper web search, per-persona sentiment −5..+5, a sentiment split, fixed report sections, a jspdf PDF and a public share link.
- AISDK Agents premium patterns the owner bought: `json-render-pdf` (PDF from a structured layout), `agent-docx-artifact` (Word), `agent-xlsx-artifact` (Excel), `ai-artifact-chart` (Recharts), `ai-artifact-table` (data grid), `agent-document-editor` (later). Install commands carry short-lived tokens; fresh ones come from the owner's account at build time.
- Cost estimate from the one measured `gpt-4.1` run (10 personas, 3 rounds, about $1.30 all-in); not yet checked against the OpenAI dashboard.

## Goals

1. **A structured report** produced by our own `gpt-4.1` call from the simulation results:
   - verdict (one or two sentences) and confidence (Low, Medium, High with a reason);
   - headline numbers: overall sentiment (−5..+5), share who would still act (buy, stay, accept, depending on the question), share who would switch or oppose, top concern with how many raised it;
   - sentiment split (positive, neutral, negative);
   - per-group table: group, people, sentiment, the action share, one-line summary;
   - three to five key findings, each with at most one verbatim quote;
   - risks and opportunities;
   - per-participant cards: name, age, location or role, group, sentiment score, short opinion, one quote;
   - sources from web research;
   - "how this was run" note (participants, groups, rounds, that it is simulated);
   - the full written analysis (MiroFish's write-up, cleaned) at the end.
2. **Where it lives:** a report card at the end of the run in the chat (verdict, sentiment bar, three numbers, Open report, PDF, Word, Excel). Open report opens a shadcn `Sheet` from the right at about 55% of the viewport (full width on phones) with tabs Summary, Groups, Participants, Sources, Full write-up, and Export (PDF, Word, Excel) and Share buttons.
3. **Exports:** PDF of the full structured report; Word of the same; Excel with one row per participant (group, demographics, sentiment, opinion, quote) plus a groups sheet.
4. **Share link:** a public read-only view of one report by unguessable token, revocable.
5. **Configure panel** above the composer: participants slider capped by plan, audience text, group chips (Customers, Prospects, Loyalists, Skeptics, Employees, Dealers/partners, Competitors, Investors, Regulators, Media, Influencers; each chosen group gets at least one participant), web research toggle (on by default), and a one-line summary when closed ("25 participants · 4 groups · 5 rounds · web research on · ~6 min").
6. **Panel size by plan.** The slider is a target: the pre-run draft names that many people across the chosen groups, each with a short sketch (age, situation, attitude), so MiroFish builds about that many. Copy says "about". The cast may differ by a few.
7. **Web research (Exa):** before the draft, search for the question and its key entities, read the top results, feed a digest into the draft and the cast, and keep sources for the report.
8. **Improve prompt:** a button in the composer that rewrites the question into a brief (the decision, who is affected, what to learn). The rewrite replaces the text; the user can edit before sending.

## Plans (owner approved 2026-11-07)

Models stay `gpt-4.1` everywhere. Allowances change:

| Plan | Price | Max participants | Max rounds | Runs |
|---|---|---|---|---|
| Guest | free | 10 | 3 | 1 lifetime |
| Free | free | 10 | 3 | 1 a month |
| Starter | $10/mo | 25 | 5 | 2 a period |
| Pro | $20/mo | 50 | 10 | 2 a period |

Estimated cost per run at the maximum, including our report call (about $0.40): Guest/Free about $1.70, Starter about $3.50, Pro about $8.40. Larger panels (Greg's 200) are an enterprise conversation, not a self-serve plan.

## Non-goals

- Changing MiroFish's code or models.
- More than 50 participants in any self-serve plan.
- Report editing with AI (the document editor pattern) in this round.
- Comparing two runs side by side.
- Mermaid diagrams.

## Anti-goals

- A report that reads like an essay with quotes stacked between paragraphs.
- Numbers in the report that are not derived from what the personas actually said (no invented percentages).
- A PDF that drops or reorders what the sheet shows.
- A web search that silently changes the question or cites sources it did not read.
- Breaking existing finished runs: they keep today's report view.

## Decisions (owner, 2026-11-07)

- **Closing debrief.** When the rounds finish and before MiroFish's environment closes, every persona is interviewed once with a fixed question: what is your view of this decision, would you go ahead with it (buy, stay, accept: whatever the question implies), and what is your main concern. Every participant then has a scored opinion and a real quote. Uses the existing interview path (`batch_interview`); runs in the interviews stage automatically, whether or not the user chose "Pause for interviews". Estimated about $0.01 per persona and 1 to 3 minutes per run.

## Decisions (controller's calls, for the owner to check)

- **Allowances apply immediately** to everyone; there are no real subscribers yet (sandbox only).
- **Uploaded documents:** when the user sets a participant count or groups, the drafted cast is always sent alongside the documents. The plan cap is a target, not a hard ceiling: MiroFish can still find extra people in a document. Known cost risk for very long documents.
- **Organisations count as participants** and in sentiment numbers, but not in the action shares (would still buy, switch), which count people only.
- **Exports use plain libraries** (`@json-render/react-pdf` or `@react-pdf/renderer`, `docx`, `xlsx`). The AISDK Agents patterns are visual reference only; nothing depends on fresh install tokens.
- **Share link built from scratch:** a `share_token` on the run (nullable, revocable), a public page rendering the report without the chat or the user's own interviews. Quotes in the report (from posts and the closing debrief) are part of the report and appear.
- **Report step failure is best-effort:** if `report_summary` fails or does not validate, the run still finishes with today's MiroFish report, plus a "Retry summary" action that reruns only the summary. A failed summary does not fail the run or use another run.

- **Structured report as a new event** (`report_summary`), written after MiroFish's report finishes, by a worker step that reads the run's posts, comments, profiles, interviews and MiroFish's write-up and returns JSON validated by zod. Sentiment and group numbers are computed in code from per-persona classifications, not asked for as free numbers.
- **Per-persona classification**: one structured call per batch of personas returns, for each persona, group, sentiment (−5..+5), action (would act / would not / unsure / not applicable for organisations), top concern and one verbatim quote taken from that persona's own posts, comments or closing debrief. The quote is checked to occur in the source text.
- **Group assignment** comes from the configured groups when set, otherwise from the draft cast's groups.
- **Web research** runs in the readiness step (web app) so the draft and the cast use it; results are stored with the run and passed to the report step. Exa key in `EXA_API_KEY`; when unset, web research is off and the toggle is hidden.
- **Exports** are generated in the browser from the stored report JSON (PDF via `@json-render/react-pdf`, Word via `docx`, Excel via `xlsx`), so no server rendering is needed.
- **Old runs** without `report_summary` keep today's report rendering.

## Left to the builder

- Prompt wording, batch sizes and the zod schemas.
- Visual design of the card and sheet within the existing ReUI/shadcn style; the mockups in `.superpowers/brainstorm/45200-1794029675/content/` are the reference.
- How the configure state is stored (per user, like rounds today) and passed in the run config.
- Rate limits for Improve prompt and web research.
- Tests, including a fixture run with known posts that produces known numbers.
