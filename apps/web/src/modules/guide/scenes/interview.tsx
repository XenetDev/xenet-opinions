'use client'

import { UserIcon } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { initials } from '@/modules/chat/parts/agent-roster'
import { InterviewCard } from '@/modules/chat/parts/interview-card'
import { useSceneClock } from '../use-scene-clock'
import { ENTER, MiniComposer, Scene, SceneChip, typed } from './scene'

const CARDS = [
  { name: 'Maya Chen', role: 'Founder, design studio' },
  { name: 'Liam Walker', role: 'IT lead, retailer' },
  { name: 'Priya Patel', role: 'Freelance analyst' },
  { name: 'Noah Ortiz', role: 'Ops manager, SaaS' },
]
const PLACEHOLDER = 'Ask the selected personas…'
export const QUESTION = 'Would you stay on Pro at the new price?'
export const ANSWER = 'Still better value than the alternatives, honestly.'
const TYPING = 10
const TYPE_FROM = 3
const THINKING = TYPE_FROM + TYPING
const STEPS = [1000, 800, 900, ...Array<number>(TYPING).fill(80), 1000, 4100]

export function InterviewScene({ active }: { active: boolean }) {
  const phase = useSceneClock({ active, steps: STEPS })
  const picked = CARDS.slice(0, Math.min(phase, 2))

  return (
    <Scene className="justify-between gap-3">
      <div className="grid grid-cols-4 gap-2">
        {CARDS.map((card, index) => {
          const pressed = index < picked.length
          return (
            <button
              key={card.name}
              type="button"
              tabIndex={-1}
              aria-pressed={pressed}
              className={cn(
                'flex w-full min-w-0 items-center gap-2 rounded-md border bg-background p-2 text-left transition-colors duration-300 motion-reduce:transition-none',
                pressed && 'border-primary bg-muted',
              )}
            >
              <Avatar size="sm">
                <AvatarFallback className="text-[10px]">{initials(card.name)}</AvatarFallback>
              </Avatar>
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{card.name}</span>
                <span className="truncate text-[10px] text-muted-foreground">{card.role}</span>
              </span>
            </button>
          )
        })}
      </div>
      {phase >= THINKING && (
        <div className={cn(ENTER, 'w-1/2 min-w-0 [&_[data-slot=bubble-content]]:text-[13px]/5')}>
          <InterviewCard
            showQuestion={false}
            data={{
              agentId: 'maya',
              agentName: 'Maya Chen',
              question: QUESTION,
              status: phase > THINKING ? 'done' : 'pending',
              answer: ANSWER,
            }}
          />
        </div>
      )}
      <MiniComposer
        text={typed(QUESTION, phase, TYPE_FROM, TYPING)}
        placeholder={PLACEHOLDER}
        chips={
          picked.length > 0 &&
          picked.map((card) => (
            <SceneChip key={card.name} icon={<UserIcon className="text-muted-foreground" />} label={card.name} />
          ))
        }
      />
    </Scene>
  )
}
