'use client'

import { CircleHelpIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useGuide } from '@/modules/guide/guide-provider'

export function GuideButton() {
  const guide = useGuide()
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="How it works" onClick={guide.open}>
          <CircleHelpIcon aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>How it works</TooltipContent>
    </Tooltip>
  )
}
