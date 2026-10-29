'use client'

import { type CSSProperties, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

const CYCLE_MS = 650
const CELLS = Array.from({ length: 9 }, (_, i) => ({ id: i, delay: ((i % 3) + Math.abs(Math.floor(i / 3) - 1)) * 90 }))

function useElapsed() {
  const [tenths, setTenths] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setTenths((t) => t + 1), 100)
    return () => clearInterval(timer)
  }, [])
  const seconds = tenths / 10
  return seconds < 60 ? `${seconds.toFixed(1)}s` : `${Math.floor(seconds / 60)}m ${(seconds % 60).toFixed(1)}s`
}

export function Thinking({ label = 'Thinking', className }: { label?: string; className?: string }) {
  const elapsed = useElapsed()
  return (
    <div role="status" className={cn('flex w-fit items-center gap-2.5', className)}>
      <span aria-hidden="true" className="grid shrink-0 grid-cols-[repeat(3,4px)] gap-[1.5px]">
        {CELLS.map(({ id, delay }) => (
          <span
            key={id}
            className="size-1 rounded-[1px] bg-foreground opacity-15 motion-safe:animate-[pixel-on_var(--cycle)_ease-in-out_infinite]"
            style={{ '--cycle': `${CYCLE_MS}ms`, animationDelay: `${delay}ms` } as CSSProperties}
          />
        ))}
      </span>
      <span className="shimmer text-[13px] font-medium [--shimmer-duration:1.4s]">{label}</span>
      <span aria-hidden="true" className="font-mono text-xs text-muted-foreground tabular-nums">
        {elapsed}
      </span>
    </div>
  )
}
