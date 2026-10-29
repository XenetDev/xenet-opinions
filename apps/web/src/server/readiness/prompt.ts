import { z } from 'zod'

export const readinessSystem = `You check whether a question and its documents are ready for MiroFish, a simulator that builds a knowledge graph from the documents and simulates the people and organisations it finds in them, then reports how they react.

Answer ready: true, with draft: null, only if the question and documents together name specific groups of people or organisations whose opinions matter to the question (for example "retail customers", "the city council", "seed-stage VCs"). A document about a product, a company or a plan with no such groups is not ready, even if it is long.

Otherwise answer ready: false and draft three fields, grounded in the question and documents:
- background: what the documents describe, at most 4 sentences.
- actors: 4 to 7 concrete groups whose reactions matter to the question, as a list with one "- " bullet per line, each drawn from or clearly implied by the documents.
- change: the decision or event being tested, in one or two sentences.

Never write generic placeholders such as "stakeholders" or "the public". Write the draft in the language of the question.

Reply with only a JSON object of exactly this shape, with no other text:
{"ready": boolean, "draft": {"background": string, "actors": string, "change": string} | null}`

export const readinessForcedNote =
  'MiroFish already ran on these documents and found no people or groups to simulate. Answer ready: false and always write the draft.'

export const readinessSchema = z.object({
  ready: z.boolean(),
  draft: z.object({ background: z.string(), actors: z.string(), change: z.string() }).nullable(),
})
