// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { type OpinionsUIMessage, STAGES, type Stage, type StageStatus } from '@xo/engine/parts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from '@/test/axe'
import { RunConsole } from './run-console'

type Parts = OpinionsUIMessage['parts']

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

const stage = (name: Stage, status: StageStatus, message?: string): Parts[number] => ({
  type: 'data-stage',
  id: `stage:${name}`,
  data: { stage: name, status, ...(message ? { message } : {}) },
})

const through = (last: Stage, status: StageStatus, message?: string): Parts => {
  const order: Stage[] = STAGES.filter((name) => name !== 'interviews')
  return [...order.slice(0, order.indexOf(last)).map((name) => stage(name, 'done')), stage(last, status, message)]
}

const windowParts = (data: { until: string | null; personaCount: number; closed: boolean; reason?: 'expired' }) => [
  ...through('sim_run', 'done'),
  stage('interviews', 'running'),
  { type: 'data-interview_window' as const, id: 'interview_window', data },
]

const open = (until = at(20)) => windowParts({ until, personaCount: 4, closed: false })

const working = through('sim_run', 'running', 'Round 1/2')

const reporting: Parts = [
  ...through('report', 'running'),
  {
    type: 'data-report_outline',
    data: { sections: [{ index: 1, title: 'Overview', status: 'writing' }] },
  },
  {
    type: 'data-report_event',
    data: {
      n: 1,
      action: 'tool_call',
      sectionIndex: 1,
      toolName: 'insight_forge',
      summary: 'Called insight_forge',
      elapsedSeconds: 10,
    },
  },
  {
    type: 'data-report_event',
    data: {
      n: 2,
      action: 'tool_result',
      sectionIndex: 1,
      toolName: 'insight_forge',
      summary: 'Found 12 facts',
      elapsedSeconds: 75,
    },
  },
  {
    type: 'data-report_event',
    data: {
      n: 3,
      action: 'tool_call',
      sectionIndex: 1,
      toolName: 'panorama_search',
      summary: 'Called panorama_search',
      elapsedSeconds: 76,
    },
  },
]

const finished: Parts = [...through('finished', 'done'), { type: 'text', text: 'The report' }]

describe('RunConsole', () => {
  it.each([
    [working, 'Working'],
    [open(), 'Needs you'],
    [through('finished', 'done'), 'Complete'],
    [through('sim_create', 'failed', 'Boom'), 'Failed'],
    [through('sim_create', 'cancelled', 'Cancelled'), 'Cancelled'],
  ] as const)('shows the status badge for each state', (parts, badge) => {
    render(<RunConsole parts={parts} chatId="c1" />)
    expect(screen.getByTestId('run-console-status').textContent).toBe(badge)
  })

  it('titles the frame', () => {
    render(<RunConsole parts={working} chatId="c1" title="How will customers react?" />)
    expect(screen.getByText('How will customers react?')).toBeTruthy()
  })

  it('puts the running stage on a polite live row with a spinner and the round', () => {
    const { container } = render(<RunConsole parts={working} chatId="c1" />)
    const liveRow = screen.getByRole('status')
    expect(liveRow.getAttribute('aria-live')).toBe('polite')
    expect(within(liveRow).getByText('Running the simulation')).toBeTruthy()
    expect(within(liveRow).getByText('Round 1 of 2')).toBeTruthy()
    expect(container.querySelector('[data-slot="spinner"]')).toBeTruthy()
    expect(screen.getByText('Step 5 of 7')).toBeTruthy()
    expect(container.querySelectorAll('[data-kind="done"]')).toHaveLength(4)
    expect(container.querySelectorAll('[data-kind="queued"]')).toHaveLength(2)
  })

  it('shows the queue position while waiting for a slot', () => {
    render(<RunConsole parts={[{ type: 'data-queue', data: { position: 2 } }]} chatId="c1" />)
    expect(screen.getByText('Waiting for a free slot, #2 in queue')).toBeTruthy()
    expect(screen.getByTestId('run-console-status').textContent).toBe('Queued')
  })

  describe('the interview window', () => {
    it('shows the personas online, until when, and the minutes left', () => {
      render(<RunConsole parts={open()} chatId="c1" />)
      expect(screen.getByText(`4 personas are online until ${clock(at(20))}`)).toBeTruthy()
      expect(screen.getByText('20 minutes left')).toBeTruthy()
      expect(screen.getByText(/one persona at a time, usually within a minute/)).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Generate report' })).toBeTruthy()
    })

    it('prefers the live keepalive over the part', () => {
      render(<RunConsole parts={open()} chatId="c1" windowUntil={at(30)} />)
      expect(screen.getByText(`4 personas are online until ${clock(at(30))}`)).toBeTruthy()
      expect(screen.getByText('30 minutes left')).toBeTruthy()
    })

    it('counts down every 30 seconds', () => {
      render(<RunConsole parts={open(at(2))} chatId="c1" />)
      expect(screen.getByText('2 minutes left')).toBeTruthy()
      act(() => vi.advanceTimersByTime(60_000))
      expect(screen.getByText('1 minute left')).toBeTruthy()
      act(() => vi.advanceTimersByTime(90_000))
      expect(screen.getByText('The window is closing')).toBeTruthy()
    })

    it('requests the report and shows that it is being generated', async () => {
      fetchSpy.mockResolvedValue(Response.json({ ok: true }, { status: 202 }))
      render(<RunConsole parts={open()} chatId="c1" />)
      fireEvent.click(screen.getByRole('button', { name: 'Generate report' }))
      await waitFor(() => expect(screen.getByText('Generating report…')).toBeTruthy())
      expect(fetchSpy).toHaveBeenCalledWith('/api/chats/c1/run/report', { method: 'POST' })
      expect(screen.queryByRole('button', { name: 'Generate report' })).toBeNull()
    })

    it('offers the button again when the request fails', async () => {
      fetchSpy.mockResolvedValue(Response.json({ error: 'run_not_paused' }, { status: 409 }))
      render(<RunConsole parts={open()} chatId="c1" />)
      fireEvent.click(screen.getByRole('button', { name: 'Generate report' }))
      await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1))
      await waitFor(() => expect(screen.getByRole('button', { name: 'Generate report' })).toBeTruthy())
      expect(screen.queryByText('Generating report…')).toBeNull()
    })

    it('shows the report as requested after a reload', () => {
      render(<RunConsole parts={open()} chatId="c1" reportRequested />)
      expect(screen.getByText('Generating report…')).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'Generate report' })).toBeNull()
    })

    it('cancels the run', () => {
      const onCancelRun = vi.fn()
      render(<RunConsole parts={open()} chatId="c1" reportRequested onCancelRun={onCancelRun} />)
      fireEvent.click(screen.getByRole('button', { name: 'Cancel run' }))
      expect(onCancelRun).toHaveBeenCalledTimes(1)
    })

    it('omits the count when it is unknown', () => {
      render(<RunConsole parts={windowParts({ until: at(20), personaCount: 0, closed: false })} chatId="c1" />)
      expect(screen.getByText(`Personas are online until ${clock(at(20))}`)).toBeTruthy()
    })

    it('shows the personas offline when the run ended without closing the window', () => {
      render(<RunConsole parts={open()} chatId="c1" windowLive={false} onCancelRun={vi.fn()} />)
      expect(screen.getByText('Personas offline')).toBeTruthy()
      expect(screen.getByText('The run ended')).toBeTruthy()
      expect(screen.queryByRole('button')).toBeNull()
      expect(screen.queryByText(/minutes? left/)).toBeNull()
    })

    it('shows the personas offline with the reason once the window closed', () => {
      render(
        <RunConsole
          parts={windowParts({ until: null, personaCount: 4, closed: true, reason: 'expired' })}
          chatId="c1"
        />,
      )
      expect(screen.getByText('Personas offline')).toBeTruthy()
      expect(screen.getByText('The interview window ended')).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'Generate report' })).toBeNull()
    })
  })

  it('shows the failure and retries from the failed row', () => {
    const onRetry = vi.fn()
    render(<RunConsole parts={through('sim_prepare', 'failed', 'Persona generation timed out')} onRetry={onRetry} />)
    expect(screen.getByText('Persona generation timed out')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Retry from here' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('offers no retry without onRetry', () => {
    render(<RunConsole parts={through('sim_prepare', 'failed', 'Boom')} />)
    expect(screen.queryByRole('button', { name: 'Retry from here' })).toBeNull()
  })

  it('folds the finished steps once the report arrives and expands on click', () => {
    const { container } = render(<RunConsole parts={finished} chatId="c1" />)
    expect(container.querySelectorAll('[data-kind="done"]')).toHaveLength(0)
    const fold = screen.getByRole('button', { name: 'Finished · 7 steps' })
    expect(fold.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(fold)
    expect(container.querySelectorAll('[data-kind="done"]')).toHaveLength(7)
  })

  it('renders report tool rows with the tool chip, a check when done and a spinner while running', () => {
    const { container } = render(<RunConsole parts={reporting} chatId="c1" />)
    const tools = Array.from(container.querySelectorAll('[data-testid="tool-row"]')) as HTMLElement[]
    expect(tools).toHaveLength(2)
    expect(within(tools[0]!).getByText('insight_forge')).toBeTruthy()
    expect(tools[0]!.getAttribute('data-kind')).toBe('done')
    expect(tools[0]!.querySelector('[data-glyph="check"]')).toBeTruthy()
    expect(within(tools[0]!).getByText('1:05')).toBeTruthy()
    expect(within(tools[1]!).getByText('panorama_search')).toBeTruthy()
    expect(tools[1]!.querySelector('[data-slot="spinner"]')).toBeTruthy()
    expect(screen.getByText('Overview')).toBeTruthy()
  })

  it('reveals a tool result as a note on the row', () => {
    render(<RunConsole parts={reporting} chatId="c1" />)
    expect(screen.queryByText('Found 12 facts')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Show result/ }))
    expect(screen.getByText('Found 12 facts')).toBeTruthy()
  })

  it.each([
    ['working', reporting],
    ['needs_you', open()],
    ['folded', finished],
    ['failed', through('sim_prepare', 'failed', 'Boom')],
  ] as const)('has no axe violations (%s)', async (_, parts) => {
    const { container } = render(<RunConsole parts={parts} chatId="c1" onCancelRun={vi.fn()} onRetry={vi.fn()} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
