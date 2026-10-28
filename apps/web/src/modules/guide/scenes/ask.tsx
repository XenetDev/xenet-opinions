'use client'

import { FileTextIcon } from 'lucide-react'
import { useSceneClock } from '../use-scene-clock'
import { MiniComposer, Scene, SceneChip, typed } from './scene'

export const ASK_QUESTION = 'How will customers react to a 20% price increase on our Pro plan?'
const TYPING = 16
const STEPS = [900, ...Array<number>(TYPING).fill(110), 1400, 5000]
const ATTACH = TYPING + 1
const SEND = TYPING + 2

export function AskScene({ active }: { active: boolean }) {
  const phase = useSceneClock({ active, steps: STEPS })
  return (
    <Scene className="justify-center px-8">
      <MiniComposer
        run
        text={typed(ASK_QUESTION, phase, 1, TYPING)}
        placeholder="Ask how people would react to…"
        pulse={phase >= SEND}
        chips={
          phase >= ATTACH && (
            <SceneChip icon={<FileTextIcon className="text-muted-foreground" />} label="pricing-brief.pdf" />
          )
        }
      />
    </Scene>
  )
}
