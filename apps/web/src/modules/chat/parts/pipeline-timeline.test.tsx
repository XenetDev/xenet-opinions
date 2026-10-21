// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { PipelineTimeline } from './pipeline-timeline'

afterEach(cleanup)

describe('PipelineTimeline', () => {
  it('renders all seven stages', () => {
    render(<PipelineTimeline stages={[]} />)
    expect(screen.getAllByTestId('stage-row')).toHaveLength(7)
    expect(screen.getByText('Reading your documents')).toBeTruthy()
    expect(screen.getByText('Done')).toBeTruthy()
  })

  it('marks a done stage and leaves the next pending', () => {
    render(<PipelineTimeline stages={[{ stage: 'ontology', status: 'done', progress: 100 }]} />)
    const rows = screen.getAllByTestId('stage-row')
    expect(rows[0]?.getAttribute('data-status')).toBe('done')
    expect(rows[1]?.getAttribute('data-status')).toBe('pending')
  })

  it('shows the message of a failed stage', () => {
    render(<PipelineTimeline stages={[{ stage: 'graph_build', status: 'failed', message: 'Graph exploded' }]} />)
    expect(screen.getAllByTestId('stage-row')[1]?.getAttribute('data-status')).toBe('failed')
    expect(screen.getByText('Graph exploded')).toBeTruthy()
  })

  it('shows a cancelled stage as muted text', () => {
    render(<PipelineTimeline stages={[{ stage: 'sim_run', status: 'cancelled', message: 'Cancelled by user' }]} />)
    expect(screen.getAllByTestId('stage-row')[4]?.getAttribute('data-status')).toBe('cancelled')
    expect(screen.getAllByText('Cancelled')).toHaveLength(1)
  })

  it('exposes status as text on every row', () => {
    render(<PipelineTimeline stages={[{ stage: 'ontology', status: 'done', progress: 100 }]} />)
    expect(screen.getAllByText('Pending')).toHaveLength(6)
    expect(screen.getAllByText('Done').length).toBeGreaterThanOrEqual(1)
  })

  it('shows a failure message without interaction', () => {
    render(<PipelineTimeline stages={[{ stage: 'report', status: 'failed', message: 'Boom' }]} />)
    expect(screen.getByText('Boom')).toBeTruthy()
    expect(screen.getAllByText('Failed')).toHaveLength(1)
  })

  it('renders a stage once with its last status', () => {
    render(
      <PipelineTimeline
        stages={[
          { stage: 'ontology', status: 'running', message: 'Echoing' },
          { stage: 'ontology', status: 'done', progress: 100 },
        ]}
      />,
    )
    expect(screen.getAllByText('Reading your documents')).toHaveLength(1)
    expect(screen.getAllByTestId('stage-row')[0]?.getAttribute('data-status')).toBe('done')
  })

  it('uses a button trigger only for rows with a message', () => {
    render(<PipelineTimeline stages={[{ stage: 'ontology', status: 'running', message: 'Echoing' }]} />)
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })
  it('offers a retry on the failed row when onRetry is given', () => {
    const onRetry = vi.fn()
    render(<PipelineTimeline stages={[{ stage: 'sim_prepare', status: 'failed', message: 'Boom' }]} onRetry={onRetry} />)
    fireEvent.click(screen.getByRole('button', { name: 'Retry from here' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('offers no retry without onRetry', () => {
    render(<PipelineTimeline stages={[{ stage: 'sim_prepare', status: 'failed', message: 'Boom' }]} />)
    expect(screen.queryByRole('button', { name: 'Retry from here' })).toBeNull()
  })
})
