import type { Research } from '@xo/db'
import { PANEL_GROUPS, type Panel } from '@xo/engine/policy'
import { z } from 'zod'

export const readinessSystem = `You check whether a question and its documents are ready for MiroFish, a simulator that builds a knowledge graph from the documents and simulates the people and organisations it finds in them, then reports how they react.

Answer ready: true, with draft: null, only if the question and documents together name specific groups of people or organisations whose opinions matter to the question (for example "retail customers", "the city council", "seed-stage VCs"). Groups named in the question count as much as groups named in documents, and documents are not required. A document about a product, a company or a plan with no such groups is not ready, even if it is long.

Otherwise answer ready: false and draft three fields, grounded in the question and documents:
- background: the situation the question is about, at most 4 sentences, using facts from the documents when there are any. Without documents, describe a realistic present-day setting for the question. Never mention the documents themselves or say that information is missing.
- actors: 4 to 7 groups whose reactions matter to the question, drawn from or clearly implied by the question and documents, as a list with one "- " bullet per group. Each bullet names the group and then two or three realistic, named examples: people with a full name and a short role, or organisations with a proper name. For example: "- Pro plan customers: Maria Lopez, owner of a small design studio; Tom Becker, freelance developer". Always write at least four different groups: the people directly affected, the organisation making the decision, its competitors or alternatives, and the press, analysts or online communities that discuss it. The simulator only finds people and organisations that are named, so every group needs named examples.
- change: the decision or event being tested, in one or two sentences.

Never write generic placeholders such as "stakeholders" or "the public". Write the draft in the language of the question.

Reply with only a JSON object of exactly this shape, with no other text:
{"ready": boolean, "draft": {"background": string, "actors": string, "change": string} | null}`

export const readinessForcedNote =
  'MiroFish already ran on these documents and found no people or groups to simulate. Answer ready: false and always write the draft.'

export const readinessNoDocumentsNote =
  'There are no documents, so the simulator will only see the question and your draft. Answer ready: false and always write the draft.'

export function panelTarget(panel: Panel): number {
  return Math.max(panel.participants, panel.groups.length)
}

export function readinessPanelNote(panel: Panel): string {
  const target = panelTarget(panel)
  const labels = PANEL_GROUPS.filter((group) => panel.groups.includes(group.id)).map((group) => group.label)
  const groups = labels.length
    ? `Use exactly these groups: ${labels.join(', ')}. Give each group a share of the people in proportion to how much its reactions matter to the question, with at least one person in every group.`
    : 'Choose 4 to 7 groups whose reactions matter to the question, with at least one person in every group.'
  return [
    `The user chose the panel for this run. Always write the draft, even if the question and documents are ready, and replace the actors rule above with this one: actors lists about ${target} individual people in total (a target; a few more or fewer is fine). ${groups}`,
    ...(panel.audience ? [`The participants should be drawn from this audience: ${panel.audience}`] : []),
    'Write each group as a line with the group name and a colon, followed by one line per person in exactly this form: "- Name, age, role or situation, location: one-sentence attitude". For example: "- Maria Lopez, 34, owner of a small design studio, Austin: would accept a 20% rise only if support gets faster." People in groups such as competitors, regulators or media are individuals at a named organisation, for example "- Priya Shah, 41, pricing lead at Canva, Sydney: expects rivals to match the rise within months." Give everyone a different full name and a realistic mix of ages, situations, places and attitudes.',
  ].join('\n')
}

export function readinessResearchSection(research: Research): string {
  return [
    `<research query="${research.query.replace(/"/g, "'")}">`,
    'Web search results about the question. Use their facts in background and to make the people realistic.',
    research.digest,
    `Sources: ${research.sources.map((source) => source.title).join('; ')}`,
    '</research>',
  ].join('\n')
}

export const readinessSchema = z.object({
  ready: z.boolean(),
  draft: z.object({ background: z.string(), actors: z.string(), change: z.string() }).nullable(),
})
