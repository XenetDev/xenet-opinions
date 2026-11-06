'use client'

import type { OpinionsUIMessage } from '@xo/engine/parts'
import { ChevronRightIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

export function SupersededAttempt({ parts, children }: { parts: OpinionsUIMessage['parts']; children: ReactNode }) {
  const error = parts.findLast((part) => part.type === 'data-error')
  const reason = (error?.type === 'data-error' ? error.data.message : 'The run stopped').replace(/\.$/, '')
  return (
    <Collapsible data-testid="superseded-attempt" className="group/attempt flex flex-col gap-2">
      <CollapsibleTrigger className="flex cursor-pointer items-center gap-1.5 self-start text-xs text-muted-foreground hover:text-foreground">
        <ChevronRightIcon
          aria-hidden="true"
          className="size-3.5 transition-transform group-data-[state=open]/attempt:rotate-90 motion-reduce:transition-none"
        />
        <span>Earlier attempt stopped: {reason}. Retried below.</span>
      </CollapsibleTrigger>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  )
}
