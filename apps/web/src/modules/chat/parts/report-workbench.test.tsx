// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ReportWorkbench } from './report-workbench'

afterEach(cleanup)

const outline = {
  title: 'Report',
  sections: [
    { index: 0, title: 'Overview', status: 'done' as const },
    { index: 1, title: 'Findings', status: 'writing' as const },
  ],
}

const events = [
  { n: 1, action: 'planning', summary: 'Drafting outline' },
  { n: 2, action: 'tool_call', sectionIndex: 1, toolName: 'search', summary: 'Searching graph' },
  { n: 3, action: 'section_content', sectionIndex: 1, summary: 'Wrote paragraph' },
]

describe('ReportWorkbench', () => {
  it('renders a step per section plus planning', () => {
    render(<ReportWorkbench outline={outline} events={events} />)
    expect(screen.getByText('Overview')).toBeTruthy()
    expect(screen.getByText('Findings')).toBeTruthy()
    expect(screen.getByText('Planning')).toBeTruthy()
    expect(screen.getByText('Drafting outline')).toBeTruthy()
    expect(screen.getByText('Wrote paragraph')).toBeTruthy()
  })

  it('renders tool calls via a collapsed tool block', () => {
    render(<ReportWorkbench outline={outline} events={events} />)
    expect(screen.getByText('search')).toBeTruthy()
  })

  it('hides steps when collapsed', () => {
    render(<ReportWorkbench outline={outline} events={events} collapsed />)
    expect(screen.queryByText('Overview')).toBeNull()
  })

  it('renders without an outline', () => {
    render(<ReportWorkbench events={events} />)
    expect(screen.getByText('Planning')).toBeTruthy()
  })
})
