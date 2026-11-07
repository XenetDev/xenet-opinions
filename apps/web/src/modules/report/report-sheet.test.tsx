// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { NO_VIEW, NOT_CLASSIFIED } from '@xo/engine/parts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { axe } from '@/test/axe'
import { reportQuestion, reportSummaryFixture as summary } from './fixture'
import { ReportSheet } from './report-sheet'

afterEach(cleanup)

const selectTab = (name: RegExp) => {
  const tab = screen.getByRole('tab', { name })
  fireEvent.mouseDown(tab)
  fireEvent.click(tab)
}

const cards = () => screen.getAllByTestId('participant-card').map((el) => within(el).getByRole('heading').textContent)

describe('ReportSheet', () => {
  it('opens on Summary with the question as title', () => {
    render(<ReportSheet summary={summary} open onOpenChange={() => {}} chatId="c1" title={reportQuestion} />)
    const dialog = screen.getByRole('dialog', { name: reportQuestion })
    expect(within(dialog).getByRole('tab', { name: 'Summary', selected: true })).toBeTruthy()
    expect(within(dialog).getByText(summary.verdict)).toBeTruthy()
    expect(within(dialog).getByText('Value for money')).toBeTruthy()
    expect(within(dialog).getByText('raised by 5 of 11')).toBeTruthy()
    expect(within(dialog).getAllByText('3 of 9 people')).toHaveLength(2)
    expect(dialog.querySelectorAll('blockquote')).toHaveLength(2)
    expect(within(dialog).getByText(/^12 AI participants in 4 groups/)).toBeTruthy()
  })

  it('filters participants by group', () => {
    render(<ReportSheet summary={summary} open onOpenChange={() => {}} chatId="c1" />)
    selectTab(/^Participants/)
    expect(cards()).toHaveLength(12)
    fireEvent.click(screen.getByRole('button', { name: 'Prospects (3)' }))
    expect(cards()).toEqual(['Aylin Kaya', 'Lukas Schmidt', 'Hannah Fischer'])
    expect(screen.getByRole('button', { name: 'Prospects (3)' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Media (2)' }))
    expect(cards()).toEqual(['AutoWelt Magazin', 'Felix Braun'])
    expect(screen.getByText('No view expressed', { selector: '[data-testid="participant-sentiment"]' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'All (12)' }))
    expect(cards()).toHaveLength(12)
  })

  it('keeps the group filter across tab switches', () => {
    render(<ReportSheet summary={summary} open onOpenChange={() => {}} chatId="c1" />)
    selectTab(/^Participants/)
    fireEvent.click(screen.getByRole('button', { name: 'Prospects (3)' }))
    selectTab(/^Groups/)
    selectTab(/^Participants/)
    expect(cards()).toEqual(['Aylin Kaya', 'Lukas Schmidt', 'Hannah Fischer'])
  })

  it('treats not-classified participants as no view', () => {
    const felix = summary.participants.at(-1)!
    render(
      <ReportSheet
        summary={{ ...summary, participants: [{ ...felix, opinion: NOT_CLASSIFIED }] }}
        open
        onOpenChange={() => {}}
        chatId="c1"
      />,
    )
    selectTab(/^Participants/)
    const card = screen.getByTestId('participant-card')
    expect(within(card).getByTestId('participant-sentiment').textContent).toBe(NO_VIEW)
    expect(within(card).queryByText(NOT_CLASSIFIED)).toBeNull()
  })

  it('reads people counts from the engine and hides them when absent', () => {
    const { headline } = summary
    const view = render(<ReportSheet summary={summary} open onOpenChange={() => {}} chatId="c1" />)
    expect(screen.getAllByText('3 of 9 people')).toHaveLength(2)
    view.rerender(
      <ReportSheet
        summary={{ ...summary, headline: { ...headline, counted: 10, actCount: 4, switchCount: 2 } }}
        open
        onOpenChange={() => {}}
        chatId="c1"
      />,
    )
    expect(screen.getByText('4 of 10 people')).toBeTruthy()
    expect(screen.getByText('2 of 10 people')).toBeTruthy()
    const { counted: _c, actCount: _a, switchCount: _s, ...stored } = headline
    view.rerender(<ReportSheet summary={{ ...summary, headline: stored }} open onOpenChange={() => {}} chatId="c1" />)
    expect(screen.queryByText(/ of \d+ people$/)).toBeNull()
  })

  it('renders duplicate model lists without key collisions', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ReportSheet
        summary={{
          ...summary,
          risks: [...summary.risks, summary.risks[0]!],
          findings: [...summary.findings, summary.findings[0]!],
          sources: [...summary.sources, summary.sources[0]!],
        }}
        open
        onOpenChange={() => {}}
        chatId="c1"
      />,
    )
    selectTab(/^Sources/)
    expect(screen.getAllByRole('link')).toHaveLength(3)
    expect(errors).not.toHaveBeenCalled()
    errors.mockRestore()
  })

  it('shows groups with a dash for organisation-only shares', () => {
    render(<ReportSheet summary={summary} open onOpenChange={() => {}} chatId="c1" />)
    selectTab(/^Groups/)
    const row = screen.getByRole('row', { name: /Media/ })
    expect(within(row).getByText('—')).toBeTruthy()
    expect(within(screen.getByRole('row', { name: /Prospects/ })).getByText('67%')).toBeTruthy()
  })

  it('links only web sources, in a new tab', () => {
    render(
      <ReportSheet
        summary={{ ...summary, sources: [...summary.sources, { title: 'Internal memo', url: 'javascript:alert(1)' }] }}
        open
        onOpenChange={() => {}}
        chatId="c1"
      />,
    )
    selectTab(/^Sources/)
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(3)
    for (const link of links) {
      expect(link.getAttribute('target')).toBe('_blank')
      expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    }
    expect(screen.getByText('Internal memo').closest('a')).toBeNull()
  })

  it('renders the full write-up', () => {
    render(<ReportSheet summary={summary} open onOpenChange={() => {}} chatId="c1" />)
    selectTab(/^Full write-up/)
    expect(screen.getByRole('heading', { name: 'Overview' })).toBeTruthy()
  })

  it('calls export and share handlers; read-only hides share', () => {
    const onExport = vi.fn()
    const onShare = vi.fn()
    const view = render(
      <ReportSheet summary={summary} open onOpenChange={() => {}} chatId="c1" onExport={onExport} onShare={onShare} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Word' }))
    fireEvent.click(screen.getByRole('button', { name: 'Share' }))
    expect(onExport).toHaveBeenCalledWith('docx')
    expect(onShare).toHaveBeenCalledOnce()
    view.rerender(<ReportSheet summary={summary} open onOpenChange={() => {}} readOnly onExport={onExport} />)
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull()
    expect(screen.getByRole('button', { name: 'PDF' })).toBeTruthy()
  })

  it.each([/^Summary/, /^Groups/, /^Participants/, /^Sources/, /^Full write-up/])(
    'has no axe violations on the %s tab',
    async (name) => {
      render(<ReportSheet summary={summary} open onOpenChange={() => {}} chatId="c1" title={reportQuestion} />)
      selectTab(name)
      expect(await axe(document.body)).toHaveNoViolations()
    },
  )
})
