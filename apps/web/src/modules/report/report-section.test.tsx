// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { reportQuestion, reportSummaryFixture as summary } from './fixture'
import { ReportBlock } from './report-section'

const mocks = vi.hoisted(() => ({ runExport: vi.fn(), toast: vi.fn() }))
vi.mock('./export/run', () => ({ runExport: mocks.runExport }))
vi.mock('sonner', () => ({ toast: mocks.toast }))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  mocks.runExport.mockReset()
  mocks.toast.mockReset()
})

const finishedAt = '2026-11-05T16:20:00.000Z'

describe('ReportBlock exports', () => {
  it('exports with the question and the finish time, busy until done', async () => {
    let finish = () => {}
    mocks.runExport.mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)))
    render(<ReportBlock summary={summary} chatId="c1" title={reportQuestion} finishedAt={finishedAt} />)
    fireEvent.click(screen.getByRole('button', { name: 'PDF' }))
    await waitFor(() => expect(mocks.runExport).toHaveBeenCalledOnce())
    expect(mocks.runExport).toHaveBeenCalledWith('pdf', summary, { title: reportQuestion, date: new Date(finishedAt) })
    expect(screen.getByRole('button', { name: 'PDF' }).getAttribute('aria-busy')).toBe('true')
    expect((screen.getByRole('button', { name: 'Excel' }) as HTMLButtonElement).disabled).toBe(true)
    finish()
    await waitFor(() => expect(screen.getByRole('button', { name: 'PDF' }).getAttribute('aria-busy')).toBeNull())
    expect((screen.getByRole('button', { name: 'Excel' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('exports from the sheet too and falls back to today without a finish time', async () => {
    mocks.runExport.mockResolvedValue(undefined)
    render(<ReportBlock summary={summary} chatId="c1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Open report' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Word' }))
    await waitFor(() => expect(mocks.runExport).toHaveBeenCalledOnce())
    const [kind, , meta] = mocks.runExport.mock.calls[0] ?? []
    expect(kind).toBe('docx')
    expect(meta.title).toBe('')
    expect(meta.exported).toBe(true)
    expect(Math.abs(meta.date.getTime() - Date.now())).toBeLessThan(5000)
  })

  it('shows a toast when the export fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.runExport.mockRejectedValue(new Error('boom'))
    render(<ReportBlock summary={summary} chatId="c1" title={reportQuestion} />)
    fireEvent.click(screen.getByRole('button', { name: 'Excel' }))
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith('The Excel file could not be created. Try again.'))
    expect(error).toHaveBeenCalled()
    expect((screen.getByRole('button', { name: 'Excel' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('offers only PDF in the read-only sheet', () => {
    render(<ReportBlock summary={summary} title={reportQuestion} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open report' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('button', { name: 'PDF' })).toBeTruthy()
    expect(within(dialog).queryByRole('button', { name: 'Word' })).toBeNull()
  })
})
