import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { formatShare, PEOPLE_ONLY_HINT } from './format'

export function ShareValue({ value }: { value: number | null }) {
  if (value !== null) return <>{formatShare(value)}</>
  return (
    <span title={PEOPLE_ONLY_HINT}>
      <span aria-hidden="true">—</span>
      <span className="sr-only">{`Not available: ${PEOPLE_ONLY_HINT.toLowerCase()}`}</span>
    </span>
  )
}

export function Quote({ children, cite, className }: { children: ReactNode; cite?: string; className?: string }) {
  return (
    <figure className={cn('border-l-2 border-border ps-3 text-muted-foreground', className)}>
      <blockquote className="text-sm/6">{`“${children}”`}</blockquote>
      {cite && <figcaption className="mt-0.5 text-xs">{cite}</figcaption>}
    </figure>
  )
}
