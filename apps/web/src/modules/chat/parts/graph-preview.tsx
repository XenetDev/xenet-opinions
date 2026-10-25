'use client'

import type { GraphData } from '@xo/engine/parts'
import dynamic from 'next/dynamic'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Artifact, ArtifactContent, ArtifactHeader, ArtifactTitle } from '@/components/ai-elements/artifact'

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false })

const HEIGHT = 240
const LABEL_LIMIT = 10

export function nodeColor(type: string | undefined): string {
  let hash = 0
  for (const char of type ?? 'unknown') hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return `hsl(${hash % 360} 65% 50%)`
}

export function GraphPreview({ data }: { data: GraphData }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    setWidth(el.clientWidth)
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const graphData = useMemo(
    () => ({
      nodes: data.nodes.map((node) => ({ ...node })),
      links: data.links.map((link) => ({ ...link })),
    }),
    [data.nodes, data.links],
  )

  return (
    <Artifact>
      <ArtifactHeader>
        <ArtifactTitle>{`Knowledge graph · ${data.nodeCount} nodes · ${data.edgeCount} edges`}</ArtifactTitle>
      </ArtifactHeader>
      <ArtifactContent className="p-0">
        <p className="sr-only">{`Graph with ${data.nodeCount} nodes and ${data.edgeCount} edges`}</p>
        <ul className="sr-only">
          {data.nodes.slice(0, LABEL_LIMIT).map((node) => (
            <li key={node.id}>{node.label}</li>
          ))}
        </ul>
        <div ref={containerRef} style={{ height: HEIGHT }} className="w-full overflow-hidden">
          {width > 0 && (
            <ForceGraph2D
              graphData={graphData}
              width={width}
              height={HEIGHT}
              nodeLabel="label"
              nodeColor={(node) => nodeColor((node as { type?: string }).type)}
              linkColor={() => 'rgba(128,128,128,0.4)'}
              cooldownTicks={100}
            />
          )}
        </div>
      </ArtifactContent>
    </Artifact>
  )
}
