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
      className={cn('size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0', className)}
      plugins={plugins}
      {...props}
    />
  ),
  (prev, next) => prev.children === next.children && prev.isAnimating === next.isAnimating,
)

Markdown.displayName = 'Markdown'
