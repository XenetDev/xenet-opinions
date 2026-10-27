// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react'
import { type OpinionsUIMessage, STAGES } from '@xo/engine/parts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { axe } from '@/test/axe'
import { MessageParts } from './message-parts'

vi.mock('./parts/graph-preview', () => ({
  GraphPreview: ({ data }: { data: { nodeCount: number; edgeCount: number } }) => (
    <div>{`Knowledge graph · ${data.nodeCount} nodes · ${data.edgeCount} edges`}</div>
  ),
}))

afterEach(cleanup)

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
    const { container } = render(<MessageParts parts={parts} />)

    const order = Array.from(container.querySelectorAll('[data-part]')).map((el) => el.getAttribute('data-part'))
    expect(order).toEqual(['sources', 'timeline', 'graph', 'agents', 'workbench', 'text', 'error'])
    expect(screen.getAllByTestId('stage-row')).toHaveLength(STAGES.length)
    expect(screen.getAllByText(/^\d+ of \d+ personas$/)).toHaveLength(1)
    expect(screen.getByText('5 of 12 personas')).toBeTruthy()
    expect(screen.queryByText('2 of 12 personas')).toBeNull()
    expect(container.querySelector('[data-event-count="3"]')).toBeTruthy()
    expect(container.querySelectorAll('[data-part="text"]')).toHaveLength(1)
    expect(screen.getByText('Final answer')).toBeTruthy()
    expect(screen.getByText('Something broke')).toBeTruthy()
  })

  it('orders report events by n inside the workbench', () => {
    const parts: Parts = [
      { type: 'data-report_event', data: { n: 2, action: 'planning', summary: 'second' } },
      { type: 'data-report_event', data: { n: 1, action: 'planning', summary: 'first' } },
      { type: 'data-report_event', data: { n: 3, action: 'planning', summary: 'third' } },
    ]
    render(<MessageParts parts={parts} />)
    expect(screen.getAllByTestId('report-event').map((el) => el.textContent)).toEqual(['first', 'second', 'third'])
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
    expect(order).toEqual(['timeline', 'interviews', 'workbench', 'text'])
    const section = container.querySelector('[data-part="interviews"]') as HTMLElement
    expect(within(section).getByText(/4 personas are online until/)).toBeTruthy()
    expect(within(section).getByRole('button', { name: 'Generate report' })).toBeTruthy()
    expect(
      within(section)
        .getAllByRole('heading')
        .map((h) => h.textContent),
    ).toEqual(['Price too high?', 'Would you switch?'])
    const groups = Array.from(section.querySelectorAll('[data-testid="interview-group"]')) as HTMLElement[]
    expect(groups).toHaveLength(3)
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

  it('renders the closed window card without interviews', () => {
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
    expect(container.querySelector('[data-part="interviews"]')).not.toBeNull()
    expect(screen.getByText('Personas offline')).toBeTruthy()
    expect(screen.getByText('The interview window ended')).toBeTruthy()
  })

  it('shows the queue card and no timeline while queued', () => {
    const { container } = render(<MessageParts parts={[{ type: 'data-queue', data: { position: 2 } }]} />)
    expect(screen.getByText('You are #2 in the queue')).toBeTruthy()
    expect(container.querySelector('[data-part="timeline"]')).toBeNull()
  })

  it('hides the queue card once stage parts exist or the position is 0', () => {
    const { container, rerender } = render(
      <MessageParts parts={[{ type: 'data-queue', data: { position: 0 } }, ...stageParts]} />,
    )
    expect(screen.queryByText(/in the queue/)).toBeNull()
    expect(container.querySelector('[data-part="timeline"]')).not.toBeNull()
    rerender(<MessageParts parts={[{ type: 'data-queue', data: { position: 2 } }, ...stageParts]} />)
    expect(screen.queryByText(/in the queue/)).toBeNull()
  })
})
