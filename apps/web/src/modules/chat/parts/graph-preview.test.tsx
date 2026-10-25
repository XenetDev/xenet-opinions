// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { axe } from '@/test/axe'
import { GraphPreview } from './graph-preview'

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
})

afterEach(cleanup)

const nodes = Array.from({ length: 12 }, (_, i) => ({ id: `n${i}`, label: `Node ${i}`, type: 'Person' }))
const data = {
  graphId: 'g1',
  nodeCount: 12,
  edgeCount: 2,
  nodes,
  links: [
    { source: 'n0', target: 'n1' },
    { source: 'n1', target: 'n2', label: 'knows' },
  ],
}

describe('GraphPreview', () => {
  it('describes the graph for screen readers', () => {
    render(<GraphPreview data={data} />)
    expect(screen.getByText('Graph with 12 nodes and 2 edges').className).toContain('sr-only')
  })

  it('lists up to ten node labels in a visually hidden list', () => {
    render(<GraphPreview data={data} />)
    const list = screen.getByRole('list')
    expect(list.className).toContain('sr-only')
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual(
      nodes.slice(0, 10).map((node) => node.label),
    )
  })

  it('has no axe violations', async () => {
    const { container } = render(<GraphPreview data={data} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
