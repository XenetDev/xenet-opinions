// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { axe } from '@/test/axe'
import { OntologyCard } from './ontology-card'

afterEach(cleanup)

const data = {
  entityTypes: ['Person', 'Company'],
  relationTypes: ['works_at', 'owns', 'founded'],
  summary: 'A summary',
}

const trigger = () => screen.getByRole('button', { name: /What I found in your documents/ })

describe('OntologyCard', () => {
  it('is a closed disclosure row with a rotating chevron', () => {
    render(<OntologyCard data={data} />)
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryAllByTestId('ontology-chip')).toHaveLength(0)
    expect(trigger().querySelector('svg')?.getAttribute('class')).toContain('in-data-open:rotate-90')
  })

  it('renders a chip per entity and relation type and the summary once opened', () => {
    render(<OntologyCard data={data} />)
    fireEvent.click(trigger())
    expect(trigger().getAttribute('aria-expanded')).toBe('true')
    expect(screen.getAllByTestId('ontology-chip')).toHaveLength(5)
    expect(screen.getByText('Person')).toBeTruthy()
    expect(screen.getByText('works_at')).toBeTruthy()
    expect(screen.getByText('A summary')).toBeTruthy()
  })

  it('has no axe violations closed or open', async () => {
    const { container } = render(<OntologyCard data={data} />)
    expect(await axe(container)).toHaveNoViolations()
    fireEvent.click(trigger())
    expect(await axe(container)).toHaveNoViolations()
  })
})
