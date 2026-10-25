// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { axe } from '@/test/axe'
import { OntologyCard } from './ontology-card'

afterEach(cleanup)

describe('OntologyCard', () => {
  it('renders a chip per entity and relation type', () => {
    render(
      <OntologyCard
        data={{
          entityTypes: ['Person', 'Company'],
          relationTypes: ['works_at', 'owns', 'founded'],
          summary: 'A summary',
        }}
      />,
    )
    expect(screen.getAllByTestId('ontology-chip')).toHaveLength(5)
    expect(screen.getByText('Person')).toBeTruthy()
    expect(screen.getByText('works_at')).toBeTruthy()
  })
  it('has no axe violations', async () => {
    const { container } = render(
      <OntologyCard
        data={{ entityTypes: ['Person', 'Company'], relationTypes: ['works_at', 'owns'], summary: 'A summary' }}
      />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
