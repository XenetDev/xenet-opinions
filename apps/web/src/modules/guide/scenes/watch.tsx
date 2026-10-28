'use client'

import { Badge } from '@/components/reui/badge'
import { Frame, FrameHeader, FramePanel, FrameTitle } from '@/components/reui/frame'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { STAGE_TITLES } from '@/modules/chat/console/derive'
import { DoneRow, LiveRow, QueuedRow } from '@/modules/chat/console/rows'
import { initials } from '@/modules/chat/parts/agent-roster'
import { useSceneClock } from '../use-scene-clock'
import { Scene } from './scene'

const STEPS = [1300, 1300, 1300, 1200, 900, 3500]
const STAGES = ['ontology', 'graph_build', 'sim_prepare', 'sim_run'] as const
const ROUND_DETAIL: Record<number, string> = { 3: 'Round 1 of 3', 4: 'Round 2 of 3', 5: 'Round 2 of 3' }
export const PERSONAS = ['Maya Chen', 'Liam Walker', 'Priya Patel', 'Noah Ortiz', 'Sofia Nguyen', 'Owen Hughes']
const GRID = 5

export function WatchScene({ active }: { active: boolean }) {
  const phase = useSceneClock({ active, steps: STEPS })
  const liveIndex = Math.min(phase, STAGES.length - 1)
  const detail = ROUND_DETAIL[phase]

  return (
    <Scene className="flex-row items-start gap-3">
      <Frame dense stacked spacing="default" className="min-w-0 flex-1">
        <FrameHeader className="flex-row items-center gap-2">
          <FrameTitle className="truncate">Simulation run</FrameTitle>
          <Badge variant="info-light" className="ms-auto shrink-0 font-normal">
            Working
          </Badge>
        </FrameHeader>
        <FramePanel className="flex flex-col p-0">
          {STAGES.map((stage, index) => {
            const row = { id: stage, title: STAGE_TITLES[stage] }
            if (index < liveIndex) return <DoneRow key={stage} row={{ ...row, kind: 'done' }} />
            if (index > liveIndex) return <QueuedRow key={stage} row={{ ...row, kind: 'queued' }} />
            return <LiveRow key={stage} mode="live" row={{ ...row, kind: 'live', ...(detail ? { detail } : {}) }} />
          })}
        </FramePanel>
      </Frame>
      {phase >= GRID && (
        <Frame
          spacing="sm"
          className="w-40 shrink-0 animate-in fade-in zoom-in-95 duration-500 ease-out motion-reduce:animate-none"
        >
          <FrameHeader>
            <FrameTitle className="font-medium">{PERSONAS.length} personas</FrameTitle>
          </FrameHeader>
          <FramePanel className="grid grid-cols-3 gap-2">
            {PERSONAS.map((name, index) => (
              <Avatar
                key={name}
                className="animate-in fade-in zoom-in-50 fill-mode-backwards duration-300 ease-out motion-reduce:animate-none"
                style={{ animationDelay: `${index * 90}ms` }}
              >
                <AvatarFallback className="text-xs">{initials(name)}</AvatarFallback>
              </Avatar>
            ))}
          </FramePanel>
        </Frame>
      )}
    </Scene>
  )
}
