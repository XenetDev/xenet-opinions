// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
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
