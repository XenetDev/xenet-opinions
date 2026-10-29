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

export const readinessSchema = z.object({
  ready: z.boolean(),
  draft: z.object({ background: z.string(), actors: z.string(), change: z.string() }).nullable(),
})
