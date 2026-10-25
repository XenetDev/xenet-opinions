// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { type OpinionsUIMessage, STAGES } from '@xo/engine/parts'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
    expect(screen.getAllByTestId('stage-row')).toHaveLength(7)
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

  it('renders interviews after text, deduped by agent with last winning', () => {
    const parts: Parts = [
      { type: 'text', text: 'Report' },
      { type: 'data-interview', data: { agentId: 'a', agentName: 'Ada', question: 'Q?', status: 'pending' } },
      { type: 'data-interview', data: { agentId: 'b', agentName: 'Bo', question: 'Q?', status: 'pending' } },
      {
        type: 'data-interview',
        data: { agentId: 'a', agentName: 'Ada', question: 'Q?', status: 'done', answer: 'Ada says yes' },
      },
    ]
    const { container } = render(<MessageParts parts={parts} />)
    const order = Array.from(container.querySelectorAll('[data-part]')).map((el) => el.getAttribute('data-part'))
    expect(order).toEqual(['text', 'interviews'])
    expect(screen.getAllByText('Ada')).toHaveLength(1)
    expect(screen.getByText('Ada says yes')).toBeTruthy()
    expect(screen.getByText('Bo')).toBeTruthy()
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
