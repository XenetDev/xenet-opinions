// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ReportSummarySchema } from '@xo/engine/parts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { axe } from '@/test/axe'
import { reportSummaryFixture as summary } from './fixture'
import { ReportCard } from './report-card'

afterEach(cleanup)

describe('ReportCard', () => {
  it('uses a fixture that matches the schema', () => {
    expect(ReportSummarySchema.parse(summary)).toEqual(summary)
  })

  it('shows the verdict, the sentiment bar and three headline numbers', () => {
    const { container } = render(<ReportCard summary={summary} onOpen={() => {}} />)
    expect(screen.getByText(summary.verdict)).toBeTruthy()
    expect(screen.getByRole('img', { name: /Sentiment split: 3 positive, 1 neutral, 7 negative of 11/ })).toBeTruthy()
    const negative = container.querySelector<HTMLElement>('[data-segment="negative"]')
    expect(Number.parseFloat(negative?.style.width ?? '')).toBeCloseTo((7 / 11) * 100)
    const stats = screen.getAllByTestId('report-card-stat').map((el) => el.textContent)
    expect(stats).toEqual(['Sentiment−1.0', 'Would go ahead33%', 'Would not go ahead33%'])
    expect(screen.getByText('Confidence: Medium')).toBeTruthy()
    expect(screen.getByText('Report ready · 12 participants · 3 sources')).toBeTruthy()
  })

  it('shows a dash with a hint when shares are not available', () => {
    render(
      <ReportCard
        summary={{ ...summary, headline: { ...summary.headline, actShare: null, switchShare: null } }}
        onOpen={() => {}}
      />,
    )
    const stats = screen.getAllByTestId('report-card-stat')
    expect(stats[1]?.textContent).toContain('—')
    expect(stats[1]?.querySelector('[title]')?.getAttribute('title')).toMatch(/people only/i)
  })

  it('opens the report and exports when handlers are passed', () => {
    const onOpen = vi.fn()
    const onExport = vi.fn()
    render(<ReportCard summary={summary} onOpen={onOpen} onExport={onExport} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open report' }))
    fireEvent.click(screen.getByRole('button', { name: 'Excel' }))
    expect(onOpen).toHaveBeenCalledOnce()
    expect(onExport).toHaveBeenCalledWith('xlsx')
  })

  it('disables exports without a handler', () => {
    render(<ReportCard summary={summary} onOpen={() => {}} />)
    expect((screen.getByRole('button', { name: 'PDF' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('marks the running export busy and blocks the others', () => {
    render(<ReportCard summary={summary} onOpen={() => {}} onExport={() => {}} exporting="pdf" />)
    const pdf = screen.getByRole('button', { name: 'PDF' }) as HTMLButtonElement
    expect(pdf.getAttribute('aria-busy')).toBe('true')
    expect(pdf.querySelector('[data-slot="spinner"]')).toBeTruthy()
    for (const name of ['PDF', 'Word', 'Excel'])
      expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Word' }).getAttribute('aria-busy')).toBeNull()
  })

  it('has no axe violations', async () => {
    const { container } = render(
      <ReportCard summary={summary} onOpen={() => {}} onExport={() => {}} exporting="docx" />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
