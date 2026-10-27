// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from '@/test/axe'
import { InterviewWindowCard } from './interview-window-card'

const NOW = new Date('2026-10-27T10:00:00Z')
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString()
const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const fetchSpy = vi.fn()

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
  vi.setSystemTime(NOW)
  fetchSpy.mockReset()
  vi.stubGlobal('fetch', fetchSpy)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const open = (until = at(20)) => ({ until, personaCount: 4, closed: false })

describe('InterviewWindowCard', () => {
  it('shows how many personas are online, until when, and the minutes left', () => {
    render(<InterviewWindowCard chatId="c1" data={open()} />)
    expect(screen.getByText(`4 personas are online until ${clock(at(20))}`)).toBeTruthy()
    expect(screen.getByText('20 minutes left')).toBeTruthy()
    expect(screen.getByText(/one persona at a time, usually within a minute/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Generate report' })).toBeTruthy()
  })

  it('prefers the live keepalive over the part', () => {
    render(<InterviewWindowCard chatId="c1" data={open()} until={at(30)} />)
    expect(screen.getByText(`4 personas are online until ${clock(at(30))}`)).toBeTruthy()
    expect(screen.getByText('30 minutes left')).toBeTruthy()
  })

  it('counts down every 30 seconds', () => {
    render(<InterviewWindowCard chatId="c1" data={open(at(2))} />)
    expect(screen.getByText('2 minutes left')).toBeTruthy()
    act(() => vi.advanceTimersByTime(60_000))
    expect(screen.getByText('1 minute left')).toBeTruthy()
    act(() => vi.advanceTimersByTime(90_000))
    expect(screen.getByText('The window is closing')).toBeTruthy()
  })

  it('requests the report and shows that it is being generated', async () => {
    fetchSpy.mockResolvedValue(Response.json({ ok: true }, { status: 202 }))
    render(<InterviewWindowCard chatId="c1" data={open()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Generate report' }))
    await waitFor(() => expect(screen.getByText('Generating report…')).toBeTruthy())
    expect(fetchSpy).toHaveBeenCalledWith('/api/chats/c1/run/report', { method: 'POST' })
    expect(screen.queryByRole('button', { name: 'Generate report' })).toBeNull()
  })

  it('offers the button again when the request fails', async () => {
    fetchSpy.mockRejectedValue(new TypeError('fetch failed'))
    render(<InterviewWindowCard chatId="c1" data={open()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Generate report' }))
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Generate report' })).toBeTruthy())
    expect(screen.queryByText('Generating report…')).toBeNull()
  })

  it('goes back to the button when the run is no longer paused', async () => {
    fetchSpy.mockResolvedValue(Response.json({ error: 'run_not_paused' }, { status: 409 }))
    render(<InterviewWindowCard chatId="c1" data={open()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Generate report' }))
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Generate report' })).toBeTruthy())
    expect(screen.queryByText('Generating report…')).toBeNull()
  })

  it('shows the personas offline when the run ended without closing the window', () => {
    render(<InterviewWindowCard chatId="c1" data={open()} live={false} onCancel={vi.fn()} />)
    expect(screen.getByText('Personas offline')).toBeTruthy()
    expect(screen.getByText('The run ended')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByText(/minutes? left/)).toBeNull()
  })

  it('offers a keyboard-reachable cancel', () => {
    const onCancel = vi.fn()
    render(<InterviewWindowCard chatId="c1" data={open()} onCancel={onCancel} />)
    const cancel = screen.getByRole('button', { name: 'Cancel run' })
    cancel.focus()
    expect(document.activeElement).toBe(cancel)
    fireEvent.click(cancel)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('keeps the cancel while the report is being requested', () => {
    render(<InterviewWindowCard chatId="c1" data={open()} reportRequested onCancel={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Cancel run' })).toBeTruthy()
  })

  it('omits the count when it is unknown', () => {
    render(<InterviewWindowCard chatId="c1" data={{ until: at(20), personaCount: 0, closed: false }} />)
    expect(screen.getByText(`Personas are online until ${clock(at(20))}`)).toBeTruthy()
  })

  it('shows the report as requested after a reload', () => {
    render(<InterviewWindowCard chatId="c1" data={open()} reportRequested />)
    expect(screen.getByText('Generating report…')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Generate report' })).toBeNull()
  })

  it.each([
    ['report_requested', 'Report requested'],
    ['expired', 'The interview window ended'],
    ['environment_stopped', 'The simulation environment stopped'],
  ] as const)('shows the personas offline with the %s reason', (reason, text) => {
    render(<InterviewWindowCard chatId="c1" data={{ until: null, personaCount: 4, closed: true, reason }} />)
    expect(screen.getByText('Personas offline')).toBeTruthy()
    expect(screen.getByText(text)).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByText(/minutes? left/)).toBeNull()
  })

  it('has no axe violations open or closed', async () => {
    const { container, rerender } = render(<InterviewWindowCard chatId="c1" data={open()} onCancel={vi.fn()} />)
    expect(await axe(container)).toHaveNoViolations()
    rerender(
      <InterviewWindowCard chatId="c1" data={{ until: null, personaCount: 4, closed: true, reason: 'expired' }} />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
