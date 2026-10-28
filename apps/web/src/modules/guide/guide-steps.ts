import type { ComponentType } from 'react'
import { AskScene } from './scenes/ask'
import { InterviewScene } from './scenes/interview'
import { ReportScene } from './scenes/report'
import { WatchScene } from './scenes/watch'

export type GuideStep = { title: string; body: string; Scene: ComponentType<{ active: boolean }> }

export const GUIDE_STEPS: GuideStep[] = [
  {
    title: 'Ask a question',
    body: 'Describe a decision and who it affects. Attach documents for the best results, or just ask.',
    Scene: AskScene,
  },
  {
    title: 'Watch the simulation unfold',
    body: 'A knowledge graph, generated personas, and a simulated public on Twitter and Reddit, round by round.',
    Scene: WatchScene,
  },
  {
    title: 'Interview the personas',
    body: 'Pause before the report, pick up to five personas and ask them anything.',
    Scene: InterviewScene,
  },
  {
    title: 'Read the report, keep asking',
    body: 'A prediction report with its sources. Ask follow-up questions any time.',
    Scene: ReportScene,
  },
]
