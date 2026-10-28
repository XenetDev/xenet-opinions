// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from '@/test/axe'
import { GraphPreview, nodeRadius, PALETTE, typeColours, UNKNOWN_COLOUR } from './graph-preview'

const graph = vi.hoisted(() => ({
  props: [] as Record<string, unknown>[],
  methods: { d3ReheatSimulation: vi.fn(), zoomToFit: vi.fn() },
}))

vi.mock('next/dynamic', () => ({
  default: () =>
    function ForceGraphMock(props: Record<string, unknown> & { ref?: { current: unknown } }) {
      graph.props.push(props)
      if (props.ref) props.ref.current = graph.methods
      return <div data-testid="force-graph" data-height={String(props.height)} />
    },
}))

const lastProps = () => graph.props.at(-1) ?? {}

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private cb: (entries: { contentRect: { width: number; height: number } }[]) => void) {}
      observe() {
        this.cb([{ contentRect: { width: 600, height: 420 } }])
      }
      disconnect() {}
    },
  )
})

let reduced = false
beforeEach(() => {
  reduced = false
  graph.props.length = 0
  graph.methods.d3ReheatSimulation.mockClear()
  graph.methods.zoomToFit.mockClear()
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduced && query.includes('reduce'),
    addEventListener() {},
    removeEventListener() {},
  }))
})

afterEach(cleanup)

const nodes = Array.from({ length: 12 }, (_, i) => ({
  id: `n${i}`,
  label: `Node ${i}`,
  ...(i === 11 ? {} : { type: i % 2 ? 'Organisation' : 'Person' }),
}))
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

describe('typeColours', () => {
  it('assigns the palette in order of first appearance', () => {
    const colours = typeColours([{ type: 'B' }, {}, { type: 'A' }, { type: 'B' }])
    expect([...colours.entries()]).toEqual([
      ['B', PALETTE[0]],
      ['A', PALETTE[1]],
    ])
  })

  it('is stable for the same input and wraps after ten types', () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ type: `T${i}` }))
    expect([...typeColours(many)]).toEqual([...typeColours(many)])
    expect(typeColours(many).get('T10')).toBe(PALETTE[0])
  })

  it('uses ten Tailwind 500 hues with slate for unknown types', () => {
    expect(PALETTE).toHaveLength(10)
    expect(UNKNOWN_COLOUR).toBe('#64748b')
  })
})

describe('nodeRadius', () => {
  it('scales from 3 to 9 by degree', () => {
    expect(nodeRadius(0, 10)).toBe(3)
    expect(nodeRadius(10, 10)).toBe(9)
    expect(nodeRadius(0, 0)).toBe(3)
    const mid = nodeRadius(5, 10)
    expect(mid).toBeGreaterThan(3)
    expect(mid).toBeLessThan(9)
  })
})

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
    const list = screen.getByRole('list', { name: 'Nodes' })
    expect(list.className).toContain('sr-only')
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(nodes.slice(0, 10).map((node) => node.label))
  })

  it('renders the canvas 420px tall with zoom and pan', () => {
    render(<GraphPreview data={data} />)
    expect(screen.getByTestId('force-graph').dataset.height).toBe('420')
    expect(lastProps().nodeCanvasObjectMode).toBe('replace')
    expect(lastProps().enableZoomInteraction).not.toBe(false)
  })

  it('shows a legend of entity types with their colours', () => {
    render(<GraphPreview data={data} />)
    const items = within(screen.getByRole('list', { name: 'Entity types' })).getAllByRole('listitem')
    expect(items.map((item) => item.textContent)).toEqual(['Person', 'Organisation', 'Other'])
    const swatch = (i: number) => items[i]?.querySelector('[data-slot="swatch"]') as HTMLElement
    expect(swatch(0).style.backgroundColor).toBe('rgb(59, 130, 246)')
    expect(swatch(1).style.backgroundColor).toBe('rgb(249, 115, 22)')
    expect(swatch(2).style.backgroundColor).toBe('rgb(100, 116, 139)')
  })

  it('toggles edge labels with the switch, off by default', () => {
    render(<GraphPreview data={data} />)
    const toggle = screen.getByRole('switch', { name: 'Show edge labels' })
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    expect(lastProps().linkCanvasObjectMode).toBeUndefined()
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    expect(lastProps().linkCanvasObjectMode).toBe('after')
    expect(typeof lastProps().linkCanvasObject).toBe('function')
  })

  it('reheats the simulation on refresh', () => {
    render(<GraphPreview data={data} />)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(graph.methods.d3ReheatSimulation).toHaveBeenCalledOnce()
  })

  it('does not animate under reduced motion', () => {
    reduced = true
    render(<GraphPreview data={data} />)
    expect(lastProps().cooldownTicks).toBe(0)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(graph.methods.d3ReheatSimulation).not.toHaveBeenCalled()
    expect(graph.methods.zoomToFit).toHaveBeenCalledWith(0, expect.any(Number))
  })

  it('opens the graph fullscreen in a dialog', () => {
    render(<GraphPreview data={data} />)
    fireEvent.click(screen.getByRole('button', { name: 'Fullscreen' }))
    const dialog = screen.getByRole('dialog', { name: 'Knowledge graph' })
    expect(within(dialog).getByTestId('force-graph')).toBeTruthy()
    expect(within(dialog).getByRole('switch', { name: 'Show edge labels' })).toBeTruthy()
    expect(within(dialog).queryByRole('button', { name: 'Fullscreen' })).toBeNull()
  })

  it('has no axe violations', async () => {
    const { container } = render(<GraphPreview data={data} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
