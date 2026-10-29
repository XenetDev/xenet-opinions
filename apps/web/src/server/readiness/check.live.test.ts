import { describe, expect, it, vi } from 'vitest'

vi.mock('@/env', () => ({
  env: {
    LLM_API_KEY: process.env.LLM_API_KEY,
    LLM_BASE_URL: process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1',
    LLM_MODEL_NAME: process.env.LLM_MODEL_NAME ?? 'gpt-4o-mini',
  },
}))

import { checkReadiness } from './check'

const TIMEOUT = 60_000

const deck = `Ledgerly — Seed round deck
Problem: month-end close takes finance teams 10 days of spreadsheet work.
Solution: Ledgerly is a SaaS platform that automates reconciliation and close for mid-market companies.
Traction: 42 paying companies, $380k ARR, 9% month-over-month growth, 118% net revenue retention.
Business model: annual subscriptions from $12k to $60k per year.
Market: $14B spend on finance operations software.
Team: ex-Stripe and ex-NetSuite founders.
The ask: raising $3M seed to grow sales and ship the audit module.`

const survey = `Pricing survey results, October 2026 (n = 1,240)
Respondents: 610 current Pro plan customers (small agencies and freelancers), 380 Team plan admins at companies of 10 to 200 staff, 250 lapsed customers who cancelled in the last year.
- 64% of Pro customers said a price rise above 15% would make them consider switching to a competitor.
- Team plan admins cared most about seat-based billing and SSO.
- Lapsed customers named price as the main reason they left (41%).`

const detailed = `We run a regional chain of twelve independent bookshops in the north of England and are considering closing on Sundays to cut staff costs by about 8%. Our regular weekend customers are mostly families with young children and retirees, and our part-time staff are largely students who rely on Sunday shifts for income. Local councils have been promoting the high streets as weekend destinations, and the neighbouring cafes and market traders benefit from our footfall. Publishers' sales reps and the authors who do Sunday signings would also lose an important slot. We want to know how customers, staff, council officers, neighbouring businesses, publishers and local press would react to the closure announcement, what the biggest objections would be, and whether a reduced Sunday opening of four hours would soften the response enough to keep most of the savings.`

describe.skipIf(!process.env.LLM_API_KEY)('checkReadiness against the live model', () => {
  it(
    'drafts investor and customer groups for a pitch deck',
    async () => {
      const result = await checkReadiness({
        text: 'Is this a good investment opportunity?',
        documents: [{ filename: 'deck.pdf', text: deck }],
      })
      expect(result.ready).toBe(false)
      if (result.ready) return
      expect(result.draft.actors).toMatch(/investor|vc|venture|angel|customer|buyer|cfo|finance team/i)
      expect(result.draft.actors).not.toContain('The people directly affected by the decision')
    },
    TIMEOUT,
  )

  it(
    'passes survey results that name respondent groups',
    async () => {
      const result = await checkReadiness({
        text: 'How would these customers react if we raised the Pro plan price by 20%?',
        documents: [{ filename: 'survey.md', text: survey }],
      })
      expect(result).toEqual({ ready: true })
    },
    TIMEOUT,
  )

  it(
    'seeds a short price-change prompt with at least four named groups',
    async () => {
      const result = await checkReadiness({ text: 'Should we raise our Pro plan price by 20%?', documents: [] })
      expect(result.ready).toBe(true)
      if (!result.ready) return
      const groups = (result.seed?.actors ?? '').split('\n').filter((line) => line.trim().startsWith('-'))
      expect(groups.length).toBeGreaterThanOrEqual(4)
    },
    TIMEOUT,
  )

  it(
    'passes a brief that names its stakeholders',
    async () => {
      expect(
        await checkReadiness({
          text: 'How would people react to this?',
          documents: [{ filename: 'brief.md', text: detailed }],
        }),
      ).toEqual({ ready: true })
    },
    TIMEOUT,
  )
})
