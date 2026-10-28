// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from '@/test/axe'
import { GraphPreview, nodeRadius, PALETTE, typeColours, UNKNOWN_COLOUR } from './graph-preview'

const graph = vi.hoisted(() => ({
  props: [] as Record<string, unknown>[],
  forces: {
    link: { distance: vi.fn() },
    charge: { strength: vi.fn((): unknown => graph.forces.charge), distanceMax: vi.fn() },
  },
  methods: {
    d3ReheatSimulation: vi.fn(),
    zoomToFit: vi.fn(),
    d3Force: vi.fn((name: string) => graph.forces[name as 'link' | 'charge']),
  },
}))

vi.mock('next/dynamic', () => ({
  default: () =>
    function ForceGraphMock(props: Record<string, unknown> & { ref?: { current: unknown } | ((v: unknown) => void) }) {
      graph.props.push(props)
      if (typeof props.ref === 'function') props.ref(graph.methods)
      else if (props.ref) props.ref.current = graph.methods
      return <div data-testid="force-graph" data-height={String(props.height)} />
    },
}))

const lastProps = () => graph.props.at(-1) ?? {}
const modeFor = (accessor: unknown) => (typeof accessor === 'function' ? accessor({}) : undefined)

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private cb: (entries: { contentRect: { width: number; height: number } }[]) => void) {}
      observe(el: HTMLElement) {
        this.cb([{ contentRect: { width: 600, height: Number.parseFloat(el.style.height) || 777 } }])
      }
      disconnect() {}
    },
  )
})

let reduced = false
let probeAlpha = 255
beforeEach(() => {
  reduced = false
  probeAlpha = 255
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () =>
      ({
        fillStyle: '',
        fillRect() {},
        getImageData(this: { fillStyle: string }) {
          const hex = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(this.fillStyle)
          const [r, g, b] = hex ? hex.slice(1).map((h) => Number.parseInt(h, 16)) : [255, 255, 255]
          return { data: [r, g, b, probeAlpha] }
        },
      }) as unknown as CanvasRenderingContext2D,
  )
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

  it('uses ten Tailwind 500 hues and a distinct zinc for unknown types', () => {
    expect(PALETTE).toHaveLength(10)
    expect(UNKNOWN_COLOUR).toBe('#a1a1aa')
    expect(PALETTE).not.toContain(UNKNOWN_COLOUR)
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
    expect(modeFor(lastProps().nodeCanvasObjectMode)).toBe('replace')
    expect(lastProps().enableZoomInteraction).not.toBe(false)
  })

  it('shows a legend of entity types with their colours', () => {
    render(<GraphPreview data={data} />)
    const items = within(screen.getByRole('list', { name: 'Entity types' })).getAllByRole('listitem')
    expect(items.map((item) => item.textContent)).toEqual(['Person', 'Organisation', 'Other'])
    const swatch = (i: number) => items[i]?.querySelector('[data-slot="swatch"]') as HTMLElement
    expect(swatch(0).style.backgroundColor).toBe('rgb(59, 130, 246)')
    expect(swatch(1).style.backgroundColor).toBe('rgb(249, 115, 22)')
    expect(swatch(2).style.backgroundColor).toBe('rgb(161, 161, 170)')
  })

  it('toggles edge labels with the switch, on by default', () => {
    render(<GraphPreview data={data} />)
    const toggle = screen.getByRole('switch', { name: 'Show edge labels' })
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    expect(modeFor(lastProps().linkCanvasObjectMode)).toBe('after')
    expect(typeof lastProps().linkCanvasObject).toBe('function')
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    expect(lastProps().linkCanvasObjectMode).toBeUndefined()
  })

  it('spreads the layout with a longer link distance, a capped charge range and a collide force', () => {
    render(<GraphPreview data={data} />)
    expect(graph.forces.link.distance).toHaveBeenCalledWith(80)
    expect(graph.forces.charge.strength).toHaveBeenCalledWith(-300)
    expect(graph.forces.charge.distanceMax).toHaveBeenCalledWith(420)
    expect(graph.methods.d3Force).toHaveBeenCalledWith('collide', expect.any(Function))
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
    expect(within(dialog).getByTestId('force-graph').dataset.height).toBe('777')
    expect(screen.getAllByTestId('force-graph')[0]?.dataset.height).toBe('420')
  })

  it('draws links in a translucent muted-foreground so they read on the dot grid', () => {
    render(<GraphPreview data={data} />)
    const linkColor = lastProps().linkColor as (link: unknown) => string
    const [, r, g, b, a] =
      linkColor({ source: 'n0', target: 'n1' }).match(/rgba\((\d+), (\d+), (\d+), ([\d.]+)\)/) ?? []
    expect([r, g, b]).toEqual(['115', '115', '115'])
    expect(Number(a)).toBeGreaterThan(0.2)
    expect(Number(a)).toBeLessThan(0.6)
  })

  it('keeps the token alpha in link colours and dims non-hovered links further', () => {
    probeAlpha = 26
    render(<GraphPreview data={data} />)
    const linkColor = () => lastProps().linkColor as (link: unknown) => string
    const alpha = (css: string) => Number(css.match(/rgba\(\d+, \d+, \d+, ([\d.]+)\)/)?.[1])
    const base = alpha(linkColor()({ source: 'n0', target: 'n1' }))
    expect(base).toBeGreaterThan(0)
    expect(base).toBeLessThan(1)
    act(() => (lastProps().onNodeHover as (n: unknown) => void)({ id: 'n5' }))
    expect(alpha(linkColor()({ source: 'n0', target: 'n1' }))).toBeLessThan(base)
  })

  const drawer = () => {
    const nodeAt = (i: number) => (lastProps().graphData as { nodes: { x?: number; y?: number }[] }).nodes[i]
    for (let i = 0; i < 12; i++) Object.assign(nodeAt(i) ?? {}, { x: i * 1000, y: 0 })
    const frame = () => (lastProps().onRenderFramePre as () => void)()
    const draw = (i: number, scale: number) => {
      const fills: number[] = []
      const ctx = {
        globalAlpha: 1,
        font: '',
        beginPath() {},
        arc() {},
        stroke() {},
        strokeText() {},
        measureText: (text: string) => ({ width: text.length * 6 }),
        fill: vi.fn(function (this: { globalAlpha: number }) {
          fills.push(this.globalAlpha)
        }),
        fillText: vi.fn(),
      }
      ;(lastProps().nodeCanvasObject as (n: unknown, c: unknown, s: number) => void)(nodeAt(i), ctx, scale)
      return { labelled: ctx.fillText.mock.calls.length > 0, alpha: fills[0] }
    }
    return { nodeAt, frame, draw }
  }

  it('labels every node at any zoom while labels do not collide', () => {
    render(<GraphPreview data={data} />)
    const { frame, draw } = drawer()
    frame()
    expect(draw(5, 0.3)).toEqual({ labelled: true, alpha: 1 })
    expect(draw(6, 0.3)).toEqual({ labelled: true, alpha: 1 })
  })

  it('skips a label that would overlap one already drawn in the same frame', () => {
    render(<GraphPreview data={data} />)
    const { nodeAt, frame, draw } = drawer()
    Object.assign(nodeAt(6) ?? {}, { x: 5000, y: 2 })
    frame()
    expect(draw(5, 1).labelled).toBe(true)
    expect(draw(6, 1).labelled).toBe(false)
    frame()
    expect(draw(6, 1).labelled).toBe(true)
  })

  it('labels the hovered node and its neighbours only, and dims the rest', () => {
    render(<GraphPreview data={data} />)
    act(() => (lastProps().onNodeHover as (n: unknown) => void)({ id: 'n1' }))
    const { nodeAt, frame, draw } = drawer()
    Object.assign(nodeAt(1) ?? {}, { x: 2000, y: 0 })
    frame()
    expect(draw(2, 1)).toEqual({ labelled: true, alpha: 1 })
    expect(draw(1, 1)).toEqual({ labelled: true, alpha: 1 })
    expect(draw(5, 1)).toMatchObject({ labelled: false })
    expect(draw(5, 1).alpha).toBeLessThan(1)
  })

  it('has no axe violations', async () => {
    const { container } = render(<GraphPreview data={data} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
