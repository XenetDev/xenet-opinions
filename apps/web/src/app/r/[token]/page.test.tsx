// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('not found')
  },
}))
vi.mock('@/server/share', () => ({ loadSharedReport: vi.fn() }))

import { reportQuestion, reportSummaryFixture as summary } from '@/modules/report/fixture'
import { loadSharedReport } from '@/server/share'
import { axe } from '@/test/axe'
import SharedReportPage, { dynamic, metadata } from './page'

const TOKEN = 'abcdefghijklmnopqrstuvwxyz012345'
const open = (token = TOKEN) => SharedReportPage({ params: Promise.resolve({ token }) })

beforeEach(() => {
  vi.mocked(loadSharedReport).mockReset()
})

afterEach(cleanup)

describe('Shared report page', () => {
  it('is never indexed, sends no referrer and renders per request', () => {
    expect(metadata.robots).toEqual({ index: false, follow: false })
    expect(metadata.referrer).toBe('no-referrer')
    expect(dynamic).toBe('force-dynamic')
  })

  it('404s when the token is unknown, revoked or its chat deleted', async () => {
    vi.mocked(loadSharedReport).mockResolvedValue(null)
    await expect(open()).rejects.toThrow('not found')
    expect(loadSharedReport).toHaveBeenCalledWith(TOKEN)
  })

  it('renders the report with the question, date and verdict, PDF only, and no chat', async () => {
    vi.mocked(loadSharedReport).mockResolvedValue({
      title: reportQuestion,
      date: '2026-11-05T16:20:00.000Z',
      summary,
    })
    const { container } = render(await open())
    expect(screen.getByRole('heading', { level: 1, name: reportQuestion })).toBeTruthy()
    expect(screen.getByText(/5 November 2026/)).toBeTruthy()
    expect(screen.getByText(summary.verdict)).toBeTruthy()
    expect(screen.getAllByText(/Simulated focus group by Xenet Opinions/).length).toBeGreaterThan(0)
    expect(screen.getByRole('tab', { name: 'Summary', selected: true })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'PDF' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Word' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull()
    expect(container.querySelector('[data-part="interviews"], [data-part="text"], [data-part="feed"]')).toBeNull()
    expect(await axe(document.body)).toHaveNoViolations()
  })
})
