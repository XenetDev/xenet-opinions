// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { OntologyCard } from './ontology-card'

afterEach(cleanup)

describe('OntologyCard', () => {
  it('renders a chip per entity and relation type', () => {
    render(
      <OntologyCard
        data={{ entityTypes: ['Person', 'Company'], relationTypes: ['works_at', 'owns', 'founded'], summary: 'A summary' }}
      />,
    )
    expect(screen.getAllByTestId('ontology-chip')).toHaveLength(5)
    expect(screen.getByText('Person')).toBeTruthy()
    expect(screen.getByText('works_at')).toBeTruthy()
  })
})
