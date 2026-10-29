'use client'

import { CircleHelpIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SidebarMenuButton } from '@/components/ui/sidebar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useGuide } from '@/modules/guide/guide-provider'

export function GuideButton({ variant = 'icon' }: { variant?: 'icon' | 'row' }) {
  const guide = useGuide()
  if (variant === 'row')
    return (
      <SidebarMenuButton size="sm" tooltip="How it works" onClick={guide.open}>
        <CircleHelpIcon aria-hidden="true" />
        <span>How it works</span>
      </SidebarMenuButton>
    )
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
