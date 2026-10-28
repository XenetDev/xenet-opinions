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
  it('titles the frame with the node and edge counts', () => {
    render(<GraphPreview data={data} />)
    const title = screen.getByText('Knowledge graph · 12 nodes · 2 edges')
    expect(title.closest('[data-slot="frame-panel-header"]')).not.toBeNull()
    expect(title.closest('[data-slot="frame"]')).not.toBeNull()
  })

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
