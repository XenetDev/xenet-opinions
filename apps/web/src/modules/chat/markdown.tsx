'use client'

import { cjk } from '@streamdown/cjk'
import { code } from '@streamdown/code'
import { math } from '@streamdown/math'
import { mermaid } from '@streamdown/mermaid'
import { type ComponentProps, memo } from 'react'
import { Streamdown } from 'streamdown'
import { cn } from '@/lib/utils'

const plugins = { cjk, code, math, mermaid }

export const Markdown = memo(
  ({ className, ...props }: ComponentProps<typeof Streamdown>) => (
    <Streamdown
      className={cn(
        'size-full [&_h1]:text-xl sm:[&_h1]:text-2xl [&_h2]:text-lg sm:[&_h2]:text-xl [&_h3]:text-base sm:[&_h3]:text-lg [&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
        className,
      )}
      plugins={plugins}
      {...props}
    />
  ),
  (prev, next) => prev.children === next.children && prev.isAnimating === next.isAnimating,
)

Markdown.displayName = 'Markdown'
