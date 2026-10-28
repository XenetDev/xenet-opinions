'use client'

import type { GraphData } from '@xo/engine/parts'
import { cn } from 'cn'
import { Maximize2Icon, RefreshCwIcon } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { ForceGraphMethods, LinkObject, NodeObject } from 'react-force-graph-2d'
import { Frame, FrameHeader, FramePanel, FrameTitle } from '@/components/reui/frame'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false })

const HEIGHT = 420
const LABEL_LIMIT = 10
const LABEL_MIN_SCALE = 1.2
const FIT_PADDING = 40
const DIM_ALPHA = 0.15

export const PALETTE = [
  '#3b82f6',
  '#f97316',
  '#10b981',
  '#8b5cf6',
  '#f43f5e',
  '#f59e0b',
  '#06b6d4',
  '#84cc16',
  '#d946ef',
  '#64748b',
] as const
export const UNKNOWN_COLOUR = '#a1a1aa'

export function typeColours(nodes: readonly { type?: string | undefined }[]): Map<string, string> {
  const colours = new Map<string, string>()
  for (const { type } of nodes) {
    if (type && !colours.has(type)) colours.set(type, PALETTE[colours.size % PALETTE.length] ?? UNKNOWN_COLOUR)
  }
  return colours
}

export function nodeRadius(degree: number, maxDegree: number): number {
  if (maxDegree <= 0) return 3
  return 3 + 6 * Math.sqrt(Math.min(degree, maxDegree) / maxDegree)
}

type Node = NodeObject<{ id: string; label: string; type?: string; colour: string; radius: number }>
type Link = LinkObject<Node, { label?: string }>

const endId = (end: unknown) => (typeof end === 'object' && end ? String((end as { id: unknown }).id) : String(end))

type Rgba = { r: number; g: number; b: number; a: number }

const GREY: Rgba = { r: 128, g: 128, b: 128, a: 0.4 }

function rgba(css: string): Rgba {
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  if (!ctx) return GREY
  ctx.fillStyle = css
  ctx.fillRect(0, 0, 1, 1)
  const [r = 128, g = 128, b = 128, a = 255] = ctx.getImageData(0, 0, 1, 1).data
  return { r, g, b, a: a / 255 }
}
const paint = ({ r, g, b, a }: Rgba, alpha = 1) => `rgba(${r}, ${g}, ${b}, ${Math.round(a * alpha * 1000) / 1000})`

type Tokens = { border: Rgba; muted: Rgba; foreground: Rgba; background: Rgba }

function readTokens(el: HTMLElement): Tokens {
  const style = getComputedStyle(el)
  const token = (name: string, fallback: string) => rgba(style.getPropertyValue(name).trim() || fallback)
  return {
    border: token('--border', '#e5e5e5'),
    muted: token('--muted-foreground', '#737373'),
    foreground: token('--foreground', '#0a0a0a'),
    background: token('--background', '#ffffff'),
  }
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(query.matches)
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return reduced
}

function GraphView({ data, fill, onFullscreen }: { data: GraphData; fill?: boolean; onFullscreen?: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<ForceGraphMethods>(undefined)
  const [tokens, setTokens] = useState<Tokens | null>(null)
  const fitted = useRef(false)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [edgeLabels, setEdgeLabels] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)
  const reduced = useReducedMotion()
  const switchId = useId()

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    setSize({ width: el.clientWidth, height: el.clientHeight })
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    setTokens(readTokens(el))
    const observer = new MutationObserver(() => setTokens(readTokens(el)))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  const colours = useMemo(() => typeColours(data.nodes), [data.nodes])

  const neighbours = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const { source, target } of data.links) {
      map.set(source, (map.get(source) ?? new Set()).add(target))
      map.set(target, (map.get(target) ?? new Set()).add(source))
    }
    return map
  }, [data.links])

  const graphData = useMemo(() => {
    const maxDegree = Math.max(0, ...[...neighbours.values()].map((s) => s.size))
    return {
      nodes: data.nodes.map(
        (node): Node => ({
          ...node,
          colour: (node.type && colours.get(node.type)) || UNKNOWN_COLOUR,
          radius: nodeRadius(neighbours.get(node.id)?.size ?? 0, maxDegree),
        }),
      ),
      links: data.links.map((link): Link => ({ ...link })),
    }
  }, [data.nodes, data.links, colours, neighbours])

  const isLit = useCallback(
    (id: string) => hovered === null || id === hovered || (neighbours.get(hovered)?.has(id) ?? false),
    [hovered, neighbours],
  )
  const touchesHovered = (link: Link) =>
    hovered !== null && (endId(link.source) === hovered || endId(link.target) === hovered)

  const drawNode = (node: Node, ctx: CanvasRenderingContext2D, scale: number) => {
    const t = tokens
    const x = node.x ?? 0
    const y = node.y ?? 0
    ctx.globalAlpha = isLit(node.id) ? 1 : DIM_ALPHA
    ctx.beginPath()
    ctx.arc(x, y, node.radius, 0, 2 * Math.PI)
    ctx.fillStyle = node.colour
    ctx.fill()
    if (node.id === hovered && t) {
      ctx.lineWidth = 2 / scale
      ctx.strokeStyle = paint(t.foreground)
      ctx.stroke()
    }
    if (t && (scale >= LABEL_MIN_SCALE || node.id === hovered)) {
      ctx.font = `${11 / scale}px ui-sans-serif, system-ui, sans-serif`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.lineWidth = 3 / scale
      ctx.strokeStyle = paint(t.background)
      ctx.lineJoin = 'round'
      const lx = x + node.radius + 3 / scale
      ctx.strokeText(node.label, lx, y)
      ctx.fillStyle = paint(t.foreground)
      ctx.fillText(node.label, lx, y)
    }
    ctx.globalAlpha = 1
  }

  const drawEdgeLabel = (link: Link, ctx: CanvasRenderingContext2D, scale: number) => {
    const t = tokens
    const s = link.source
    const e = link.target
    if (!t || !link.label || typeof s !== 'object' || typeof e !== 'object') return
    ctx.globalAlpha = hovered === null || touchesHovered(link) ? 1 : DIM_ALPHA
    ctx.font = `${9 / scale}px ui-sans-serif, system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const mx = ((s.x ?? 0) + (e.x ?? 0)) / 2
    const my = ((s.y ?? 0) + (e.y ?? 0)) / 2
    ctx.lineWidth = 3 / scale
    ctx.strokeStyle = paint(t.background)
    ctx.lineJoin = 'round'
    ctx.strokeText(link.label, mx, my)
    ctx.fillStyle = paint(t.muted)
    ctx.fillText(link.label, mx, my)
    ctx.globalAlpha = 1
  }

  const linkColour = (link: Link) => {
    const t = tokens
    if (!t) return paint(GREY)
    if (hovered === null) return paint(t.border)
    return touchesHovered(link) ? paint(t.muted) : paint(t.border, DIM_ALPHA * 2)
  }

  const refresh = () => {
    fitted.current = false
    if (reduced) graphRef.current?.zoomToFit(0, FIT_PADDING)
    else graphRef.current?.d3ReheatSimulation()
  }

  return (
    <div className={cn('flex min-w-0 flex-col', fill && 'min-h-0 flex-1')}>
      <div className="flex items-center justify-end gap-1 border-b px-3 py-1.5">
        <div className="mr-auto flex items-center gap-2">
          <Switch id={switchId} size="sm" checked={edgeLabels} onCheckedChange={setEdgeLabels} />
          <Label htmlFor={switchId} className="text-xs font-normal text-muted-foreground">
            Show edge labels
          </Label>
        </div>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Refresh" onClick={refresh}>
          <RefreshCwIcon aria-hidden />
        </Button>
        {onFullscreen && (
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Fullscreen" onClick={onFullscreen}>
            <Maximize2Icon aria-hidden />
          </Button>
        )}
      </div>
      <div
        ref={containerRef}
        style={fill ? undefined : { height: HEIGHT }}
        className={cn(
          'w-full overflow-hidden bg-[radial-gradient(var(--border)_1px,transparent_1px)] bg-size-[16px_16px]',
          fill && 'min-h-0 flex-1',
        )}
      >
        {size.width > 0 && size.height > 0 && (
          <ForceGraph2D
            ref={graphRef}
            graphData={graphData}
            width={size.width}
            height={size.height}
            nodeCanvasObjectMode="replace"
            nodeCanvasObject={(node, ctx, scale) => drawNode(node as Node, ctx, scale)}
            nodePointerAreaPaint={(node, colour, ctx) => {
              const n = node as Node
              ctx.fillStyle = colour
              ctx.beginPath()
              ctx.arc(n.x ?? 0, n.y ?? 0, n.radius + 2, 0, 2 * Math.PI)
              ctx.fill()
            }}
            linkColor={(link) => linkColour(link as Link)}
            linkWidth={(link) => (touchesHovered(link as Link) ? 1.5 : 1)}
            linkCanvasObjectMode={edgeLabels ? 'after' : undefined}
            linkCanvasObject={edgeLabels ? (link, ctx, scale) => drawEdgeLabel(link as Link, ctx, scale) : undefined}
            onNodeHover={(node) => setHovered(node ? (node as Node).id : null)}
            onEngineStop={() => {
              if (fitted.current) return
              fitted.current = true
              graphRef.current?.zoomToFit(reduced ? 0 : 400, FIT_PADDING)
            }}
            warmupTicks={reduced ? 100 : 0}
            cooldownTicks={reduced ? 0 : 100}
          />
        )}
      </div>
      <ul
        aria-label="Entity types"
        className="flex flex-wrap gap-x-3 gap-y-1 border-t px-3 py-2 text-xs text-muted-foreground"
      >
        {[...colours].map(([type, colour]) => (
          <li key={type} className="flex items-center gap-1.5">
            <span data-slot="swatch" aria-hidden className="size-2 rounded-full" style={{ backgroundColor: colour }} />
            {type}
          </li>
        ))}
        {data.nodes.some((node) => !node.type) && (
          <li className="flex items-center gap-1.5">
            <span
              data-slot="swatch"
              aria-hidden
              className="size-2 rounded-full"
              style={{ backgroundColor: UNKNOWN_COLOUR }}
            />
            Other
          </li>
        )}
      </ul>
    </div>
  )
}

export function GraphPreview({ data }: { data: GraphData }) {
  const [fullscreen, setFullscreen] = useState(false)

  return (
    <Frame spacing="sm" className="w-full">
      <FrameHeader>
        <FrameTitle className="font-medium">{`Knowledge graph · ${data.nodeCount} nodes · ${data.edgeCount} edges`}</FrameTitle>
      </FrameHeader>
      <FramePanel className="p-0">
        <p className="sr-only">{`Graph with ${data.nodeCount} nodes and ${data.edgeCount} edges`}</p>
        <ul aria-label="Nodes" className="sr-only">
          {data.nodes.slice(0, LABEL_LIMIT).map((node) => (
            <li key={node.id}>{node.label}</li>
          ))}
        </ul>
        <GraphView data={data} onFullscreen={() => setFullscreen(true)} />
      </FramePanel>
      <Dialog open={fullscreen} onOpenChange={setFullscreen}>
        <DialogContent
          className="flex h-[calc(100svh-2rem)] flex-col gap-2 p-2 sm:max-w-[calc(100vw-2rem)]"
          aria-describedby={undefined}
        >
          <DialogTitle className="px-1 pt-1">Knowledge graph</DialogTitle>
          {fullscreen && <GraphView data={data} fill />}
        </DialogContent>
      </Dialog>
    </Frame>
  )
}
