import { ArrowUpIcon, PlusIcon, RepeatIcon, XIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Badge } from '@/components/reui/badge'
import { Frame, FramePanel } from '@/components/reui/frame'
import { InputGroup, InputGroupAddon, InputGroupButton } from '@/components/ui/input-group'
import { cn } from '@/lib/utils'
import { roundsLabel } from '@/modules/chat/composer/run-options'

export const ENTER = 'animate-in fade-in-50 slide-in-from-bottom-1 duration-300 ease-out motion-reduce:animate-none'

export function typed(text: string, phase: number, from: number, count: number): string {
  const done = Math.min(Math.max(phase - from + 1, 0), count)
  return text.slice(0, Math.ceil((text.length * done) / count))
}

export function Scene({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      aria-hidden="true"
      inert
      data-testid="guide-scene"
      className={cn(
        'pointer-events-none relative flex aspect-video w-full flex-col overflow-hidden rounded-xl border bg-muted/40 p-4 text-xs select-none',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function SceneChip({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <Badge variant="outline" className={cn(ENTER, 'max-w-full min-w-0 gap-1 pe-0.5 font-normal')}>
      {icon}
      <span className="max-w-40 min-w-0 truncate">{label}</span>
      <span className="flex size-4 items-center justify-center rounded-full text-muted-foreground [&_svg]:size-3">
        <XIcon />
      </span>
    </Badge>
  )
}

export function MiniComposer({
  text,
  placeholder,
  chips,
  run = false,
  pulse = false,
}: {
  text: string
  placeholder: string
  chips?: ReactNode
  run?: boolean
  pulse?: boolean
}) {
  return (
    <Frame dense spacing="sm" className="w-full">
      <FramePanel className="p-0">
        <InputGroup className="border-0 bg-transparent shadow-none dark:bg-transparent">
          {chips && (
            <InputGroupAddon align="block-start" className="flex-wrap gap-1 px-3">
              {chips}
            </InputGroupAddon>
          )}
          <div className="min-h-12 w-full px-3 py-2.5 text-[13px] leading-5">
            {text || <span className="text-muted-foreground">{placeholder}</span>}
          </div>
          <InputGroupAddon align="block-end" className="gap-1 px-1">
            {run && (
              <>
                <InputGroupButton size="icon-sm" tabIndex={-1}>
                  <PlusIcon />
                </InputGroupButton>
                <InputGroupButton size="sm" variant="ghost" tabIndex={-1}>
                  <RepeatIcon data-icon="inline-start" />
                  {roundsLabel(3)}
                </InputGroupButton>
              </>
            )}
            <InputGroupButton
              size="icon-sm"
              variant="default"
              tabIndex={-1}
              data-pulse={pulse || undefined}
              className={cn(
                'ms-auto transition-shadow motion-reduce:transition-none',
                pulse && 'animate-pulse ring-4 ring-primary/25 motion-reduce:animate-none',
              )}
            >
              <ArrowUpIcon />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </FramePanel>
    </Frame>
  )
}
