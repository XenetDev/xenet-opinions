// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { type OpinionsUIMessage, STAGES } from '@xo/engine/parts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { reportQuestion, reportSummaryFixture } from '@/modules/report/fixture'
import { axe } from '@/test/axe'
import { MessageParts } from './message-parts'

vi.mock('./parts/graph-preview', () => ({
  GraphPreview: ({ data }: { data: { nodeCount: number; edgeCount: number } }) => (
    <div>{`Knowledge graph · ${data.nodeCount} nodes · ${data.edgeCount} edges`}</div>
  ),
}))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

type Parts = OpinionsUIMessage['parts']

const stageParts: Parts = STAGES.map((stage) => ({
  type: 'data-stage' as const,
  data: { stage, status: 'done' as const },
}))

const agents = (count: number): Parts[number] => ({
  type: 'data-agents',
  data: { count, expected: 12, profiles: [] },
})

describe('MessageParts', () => {
  it('groups parts into one card each, last wins, in render order', () => {
    const parts: Parts = [
      { type: 'text', text: 'Final answer' },
      ...stageParts,
      agents(2),
      agents(5),
      { type: 'data-report_event', data: { n: 3, action: 'planning', summary: 'third' } },
      { type: 'data-report_event', data: { n: 1, action: 'planning', summary: 'first' } },
      { type: 'data-report_event', data: { n: 2, action: 'planning', summary: 'second' } },
      {
        type: 'data-sources',
        data: { files: [{ id: 'f', filename: 'a.pdf', mediaType: 'application/pdf', sizeBytes: 10 }] },
      },
      { type: 'data-graph', data: { graphId: 'g', nodeCount: 4, edgeCount: 3, nodes: [], links: [] } },
      { type: 'data-error', data: { stage: 'report', code: 'x', message: 'Something broke' } },
    ]
    const { container } = render(<MessageParts parts={parts} title="How will customers react?" />)

    const order = Array.from(container.querySelectorAll('[data-part]')).map((el) => el.getAttribute('data-part'))
    expect(order).toEqual(['console', 'graph', 'agents', 'text'])
    expect(screen.queryByText('a.pdf')).toBeNull()
    expect(screen.getByText('How will customers react?')).toBeTruthy()
    expect(screen.getByTestId('run-console').getAttribute('data-status')).toBe('failed')
    expect(screen.getAllByText(/^\d+ of \d+ personas$/)).toHaveLength(1)
    expect(screen.getByText('5 of 12 personas')).toBeTruthy()
    expect(screen.queryByText('2 of 12 personas')).toBeNull()
    expect(container.querySelectorAll('[data-part="text"]')).toHaveLength(1)
    expect(screen.getByText('Final answer')).toBeTruthy()
    expect(screen.getByText('Something broke')).toBeTruthy()
  })

  it('pairs report tool events in n order inside the console', () => {
    const parts: Parts = [
      { type: 'data-stage', data: { stage: 'report', status: 'running' } },
      { type: 'data-report_event', data: { n: 2, action: 'tool_result', toolName: 'insight_forge', summary: 'done' } },
      { type: 'data-report_event', data: { n: 1, action: 'tool_call', toolName: 'insight_forge', summary: 'call' } },
    ]
    render(<MessageParts parts={parts} />)
    const tools = screen.getAllByTestId('tool-row')
    expect(tools).toHaveLength(1)
    expect(tools[0]?.getAttribute('data-kind')).toBe('done')
  })

  it('renders nothing for no parts', () => {
    const { container } = render(<MessageParts parts={[]} />)
    expect(container.querySelectorAll('[data-part]')).toHaveLength(0)
  })

  it('renders interviews before the report, deduped by id with last winning', () => {
    const parts: Parts = [
      { type: 'text', text: 'Report' },
      {
        type: 'data-interview',
        data: { id: 'ia', questionId: 'q', agentId: 'a', agentName: 'Ada', question: 'Q?', status: 'pending' },
      },
      {
        type: 'data-interview',
        data: { id: 'ib', questionId: 'q', agentId: 'b', agentName: 'Bo', question: 'Q?', status: 'pending' },
      },
      {
        type: 'data-interview',
        data: {
          id: 'ia',
          questionId: 'q',
          agentId: 'a',
          agentName: 'Ada',
          question: 'Q?',
          status: 'done',
          answer: 'Ada says yes',
        },
      },
    ]
    const { container } = render(<MessageParts parts={parts} />)
    const order = Array.from(container.querySelectorAll('[data-part]')).map((el) => el.getAttribute('data-part'))
    expect(order).toEqual(['interviews', 'text'])
    expect(screen.getAllByText('Ada')).toHaveLength(1)
    expect(screen.getByText('Ada says yes')).toBeTruthy()
    expect(screen.getByText('Bo')).toBeTruthy()
  })

  it('renders a replayed interview window: card, then one group per question with its personas', async () => {
    const until = new Date(Date.now() + 20 * 60_000).toISOString()
    const interview = (
      id: string,
      questionId: string | undefined,
      agentId: string,
      agentName: string,
      question: string,
      rest: { status: 'pending' | 'done' | 'failed'; answer?: string; error?: string },
    ): Parts[number] => ({
      type: 'data-interview',
      id: `interview:${id}`,
      data: { ...(questionId && { id, questionId }), agentId, agentName, question, ...rest },
    })
    const parts: Parts = [
      { type: 'data-stage', id: 'stage:sim_run', data: { stage: 'sim_run', status: 'done' } },
      { type: 'data-stage', id: 'stage:interviews', data: { stage: 'interviews', status: 'running' } },
      { type: 'data-interview_window', id: 'interview_window', data: { until, personaCount: 4, closed: false } },
      interview('legacy', undefined, 'c', 'Cy', 'Old question?', { status: 'done', answer: 'Cy legacy answer' }),
      interview('i1', 'q1', 'a', 'Ada', 'Price too high?', { status: 'done', answer: 'Ada thinks so' }),
      interview('i2', 'q1', 'b', 'Bo', 'Price too high?', { status: 'pending' }),
      interview('i3', 'q2', 'a', 'Ada', 'Would you switch?', { status: 'failed', error: 'Agents are offline' }),
      interview('i4', 'q2', 'b', 'Bo', 'Would you switch?', { status: 'done', answer: 'Bo would switch' }),
      { type: 'data-report_event', data: { n: 1, action: 'planning', summary: 'first' } },
      { type: 'text', text: 'The report' },
    ]
    const { container } = render(<MessageParts parts={parts} chatId="c1" />)

    const order = Array.from(container.querySelectorAll('[data-part]')).map((el) => el.getAttribute('data-part'))
    expect(order).toEqual(['console', 'interviews', 'text'])
    const consolePart = container.querySelector('[data-part="console"]') as HTMLElement
    expect(within(consolePart).getByText(/4 personas are online until/)).toBeTruthy()
    expect(within(consolePart).getByRole('button', { name: 'Generate report' })).toBeTruthy()
    const section = container.querySelector('[data-part="interviews"]') as HTMLElement
    expect(
      within(section)
        .getAllByRole('heading')
        .map((h) => h.textContent),
    ).toEqual(['Price too high?', 'Would you switch?'])
    const groups = Array.from(section.querySelectorAll('[data-testid="interview-group"]')) as HTMLElement[]
    expect(groups).toHaveLength(3)
    const question = within(groups[1]!).getByRole('heading', { name: 'Price too high?' })
    expect(question.className.split(' ')).toEqual(expect.arrayContaining(['text-sm/6', 'sm:text-[15px]/6']))
    const bubble = question.closest('[data-slot="bubble"]')
    expect(bubble?.getAttribute('data-variant')).toBe('muted')
    expect(bubble?.getAttribute('data-align')).toBe('end')
    expect(
      within(groups[1]!)
        .getAllByRole('group')
        .map((persona) => persona.getAttribute('aria-label')),
    ).toEqual(['Ada', 'Bo'])
    const cards = (group: HTMLElement) =>
      Array.from(group.querySelectorAll('[data-status]')).map((card) => card.getAttribute('data-status'))
    expect(within(groups[0]!).queryByRole('heading')).toBeNull()
    expect(within(groups[0]!).getByText('Old question?')).toBeTruthy()
    expect(within(groups[0]!).getByText('Cy legacy answer')).toBeTruthy()
    expect(cards(groups[1]!)).toEqual(['done', 'pending'])
    expect(within(groups[1]!).getByText('Ada thinks so')).toBeTruthy()
    expect(within(groups[1]!).getByTestId('interview-pending')).toBeTruthy()
    expect(within(groups[1]!).queryByText('Price too high?', { selector: 'p' })).toBeNull()
    expect(cards(groups[2]!)).toEqual(['failed', 'done'])
    expect(within(groups[2]!).getByText('Agents are offline')).toBeTruthy()
    expect(within(groups[2]!).getByText('Bo would switch')).toBeTruthy()
    expect(screen.getByText('Personas online')).toBeTruthy()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('renders the closed window in the console without interviews', () => {
    const { container } = render(
      <MessageParts
        parts={[
          {
            type: 'data-interview_window',
            id: 'interview_window',
            data: { until: null, personaCount: 4, closed: true, reason: 'expired' },
          },
        ]}
      />,
    )
    expect(container.querySelector('[data-part="console"]')).not.toBeNull()
    expect(container.querySelector('[data-part="interviews"]')).toBeNull()
    expect(screen.getByText('Personas offline')).toBeTruthy()
    expect(screen.getByText('The interview window ended')).toBeTruthy()
  })

  it('shows the queued row in the console while queued', () => {
    render(<MessageParts parts={[{ type: 'data-queue', data: { position: 2 } }]} />)
    expect(screen.getByText('Waiting for a free slot, #2 in queue')).toBeTruthy()
    expect(screen.getByTestId('run-console').getAttribute('data-status')).toBe('queued')
  })

  it('drops the queued row once stage parts exist and shows no console for position 0 alone', () => {
    const { container, rerender } = render(<MessageParts parts={[{ type: 'data-queue', data: { position: 0 } }]} />)
    expect(container.querySelector('[data-part="console"]')).toBeNull()
    rerender(<MessageParts parts={[{ type: 'data-queue', data: { position: 2 } }, ...stageParts]} />)
    expect(screen.queryByText(/in queue/)).toBeNull()
    expect(screen.getByTestId('run-console').getAttribute('data-status')).toBe('complete')
  })
})

describe('MessageParts report', () => {
  const report: Parts[number] = { type: 'text', text: '# MiroFish report\n\nOwners push back.' }
  const summaryPart: Parts[number] = { type: 'data-report_summary', data: reportSummaryFixture }
  const failedPart: Parts[number] = { type: 'data-report_summary_failed', data: { message: 'invalid' } }

  it('keeps today’s report for an old run without a summary', () => {
    const { container } = render(<MessageParts parts={[...stageParts, report]} chatId="c1" />)
    expect(screen.getByRole('heading', { name: 'MiroFish report' })).toBeTruthy()
    expect(container.querySelector('[data-part="report"]')).toBeNull()
    expect(screen.queryByTestId('report-card')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Retry summary' })).toBeNull()
  })

  it('shows the card, then the cleaned write-up below it, and opens the sheet on Summary', () => {
    const { container } = render(
      <MessageParts parts={[...stageParts, report, summaryPart]} chatId="c1" question={reportQuestion} />,
    )
    expect(container.querySelector('[data-part="text"]')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'MiroFish report' })).toBeNull()
    const card = container.querySelector('[data-part="report"]')
    const writeup = container.querySelector('[data-part="writeup"]')
    expect(card).not.toBeNull()
    expect(writeup && within(writeup as HTMLElement).getByRole('heading', { name: 'Overview' })).toBeTruthy()
    expect(card!.compareDocumentPosition(writeup!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Open report' }))
    const dialog = screen.getByRole('dialog', { name: reportQuestion })
    expect(within(dialog).getByRole('tab', { name: 'Summary', selected: true })).toBeTruthy()
    expect(within(dialog).queryByRole('tab', { name: /^Full write-up/ })).toBeNull()
  })

  it('falls back to the raw report when the summary has no write-up', () => {
    render(
      <MessageParts
        parts={[
          ...stageParts,
          report,
          { type: 'data-report_summary', data: { ...reportSummaryFixture, writeup: ' ' } },
        ]}
        chatId="c1"
      />,
    )
    expect(screen.getByTestId('report-card')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'MiroFish report' })).toBeTruthy()
  })

  it('shows the write-up and a Writing the summary line while the live run builds the summary', () => {
    const view = render(<MessageParts parts={[report]} chatId="c1" windowLive />)
    expect(screen.getByRole('heading', { name: 'MiroFish report' })).toBeTruthy()
    const pending = view.container.querySelector<HTMLElement>('[data-part="summary-pending"]')
    expect(pending && within(pending).getByRole('status').textContent).toContain('Writing the summary…')
    expect(
      pending!.compareDocumentPosition(view.container.querySelector('[data-part="text"]')!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    view.rerender(<MessageParts parts={[report, summaryPart]} chatId="c1" windowLive />)
    expect(view.container.querySelector('[data-part="summary-pending"]')).toBeNull()
    expect(screen.getByTestId('report-card')).toBeTruthy()
    view.rerender(<MessageParts parts={[report]} chatId="c1" />)
    expect(view.container.querySelector('[data-part="summary-pending"]')).toBeNull()
    view.rerender(<MessageParts parts={[report, failedPart]} chatId="c1" windowLive />)
    expect(view.container.querySelector('[data-part="summary-pending"]')).toBeNull()
  })

  it('offers Retry summary when the summary failed and shows the card on success', async () => {
    const fetchSpy = vi.fn(async () => Response.json({ summary: reportSummaryFixture }, { status: 201 }))
    vi.stubGlobal('fetch', fetchSpy)
    render(<MessageParts parts={[...stageParts, report, failedPart]} chatId="c1" messageId="a1" />)
    expect(screen.getByRole('heading', { name: 'MiroFish report' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Retry summary' }))
    await waitFor(() => expect(screen.getByTestId('report-card')).toBeTruthy())
    expect(fetchSpy).toHaveBeenCalledWith('/api/chats/c1/run/summary', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messageId: 'a1' }),
    })
    expect(screen.queryByRole('heading', { name: 'MiroFish report' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Overview' })).toBeTruthy()
  })

  it.each([
    ['summary_unavailable', 503, 'Summaries are not available right now.'],
    ['summary_retry_limit', 429, 'The summary could not be built after several tries. The full report is below.'],
    ['summary_not_failed', 409, 'There is no failed summary to retry. Reload the page.'],
  ])('keeps the report and explains when the retry is refused with %s', async (error, status, text) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ error }, { status })),
    )
    const { container } = render(<MessageParts parts={[...stageParts, report, failedPart]} chatId="c1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Retry summary' }))
    const retry = container.querySelector<HTMLElement>('[data-part="summary-retry"]')!
    await waitFor(() => expect(within(retry).getByRole('status').textContent).toBe(text))
    expect(screen.getByRole('heading', { name: 'MiroFish report' })).toBeTruthy()
    expect(screen.queryByTestId('report-card')).toBeNull()
  })

  it('has no axe violations with the card or the retry', async () => {
    const view = render(<MessageParts parts={[...stageParts, report, summaryPart]} chatId="c1" />)
    expect(await axe(view.container)).toHaveNoViolations()
    view.rerender(<MessageParts parts={[...stageParts, report, failedPart]} chatId="c1" />)
    expect(await axe(view.container)).toHaveNoViolations()
  })
})
