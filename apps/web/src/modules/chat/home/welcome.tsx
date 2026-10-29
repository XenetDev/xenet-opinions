'use client'

import { CornerDownLeftIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

const STARTERS = [
  'How will customers react to a 20% price increase on our Pro plan?',
  'What happens to public opinion if the city bans e-scooters downtown?',
  'How would employees respond to a return-to-office mandate?',
]

export function Welcome({ onUseStarter }: { onUseStarter: (prompt: string) => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="m-auto flex w-full max-w-2xl flex-col px-4 py-6 sm:px-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">Xenet Opinions</h1>
          <p className="text-sm text-muted-foreground">Ask how a group of people would react to a decision.</p>
        </div>
        <div className="mt-5 flex flex-col">
          {STARTERS.map((prompt) => (
            <Button
              key={prompt}
              type="button"
              variant="ghost"
              onClick={() => onUseStarter(prompt)}
              className="group/prompt h-auto w-full justify-start gap-3 rounded-none border-x-0 border-t-0 border-b border-border px-0 py-2.5 text-start font-normal whitespace-normal last:border-b-0 hover:bg-transparent dark:hover:bg-transparent"
            >
              <span className="min-w-0 flex-1">{prompt}</span>
              <CornerDownLeftIcon
                aria-hidden="true"
                className="size-4 shrink-0 opacity-40 transition-opacity group-hover/prompt:opacity-100"
              />
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}
