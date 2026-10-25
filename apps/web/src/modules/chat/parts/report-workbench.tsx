'use client'

import type { ReportEventData, ReportOutlineData } from '@xo/engine/parts'
import { CheckCircle2Icon, CircleDashedIcon, Loader2Icon } from 'lucide-react'
import { useId, useState } from 'react'
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
} from '@/components/ai-elements/chain-of-thought'
import { Tool, ToolContent, ToolHeader } from '@/components/ai-elements/tool'

type SectionStatus = ReportOutlineData['sections'][number]['status']

const STATUS_ICONS = {
  pending: CircleDashedIcon,
  writing: Loader2Icon,
  done: CheckCircle2Icon,
} as const

const STATUS_LABELS = { pending: 'Pending', writing: 'Running', done: 'Done' } as const satisfies Record<
  SectionStatus,
  string
>

const STEP_STATUS = { pending: 'pending', writing: 'active', done: 'complete' } as const satisfies Record<
  SectionStatus,
  'pending' | 'active' | 'complete'
>

function EventLine({ event }: { event: ReportEventData }) {
  if (event.action === 'tool_call' || event.action === 'tool_result') {
    return (
      <Tool data-testid="report-event" className="mb-0">
        <ToolHeader
          type="dynamic-tool"
          toolName={event.toolName ?? 'tool'}
          state={event.action === 'tool_call' ? 'input-available' : 'output-available'}
        />
        <ToolContent>
          <p className="text-sm">{event.summary}</p>
        </ToolContent>
      </Tool>
    )
  }
  return (
    <p data-testid="report-event" className="text-xs text-muted-foreground">
      {event.summary}
    </p>
  )
}

export function ReportWorkbench({
  outline,
  events,
  collapsed = false,
}: {
  outline?: ReportOutlineData
  events: ReportEventData[]
  collapsed?: boolean
}) {
  const [prevCollapsed, setPrevCollapsed] = useState(collapsed)
  const [open, setOpen] = useState(!collapsed)
  const contentId = useId()
  if (collapsed !== prevCollapsed) {
    setPrevCollapsed(collapsed)
    setOpen(!collapsed)
  }

  const sections = outline?.sections ?? []
  const planning = events.filter((event) => event.sectionIndex === undefined)

  return (
    <ChainOfThought open={open} onOpenChange={setOpen} data-event-count={events.length}>
      <ChainOfThoughtHeader aria-controls={open ? contentId : undefined}>
        {outline?.title ?? 'Writing the report'}
      </ChainOfThoughtHeader>
      <ChainOfThoughtContent id={contentId}>
        {planning.length > 0 && (
          <ChainOfThoughtStep label="Planning" status="complete">
            {planning.map((event) => (
              <EventLine key={event.n} event={event} />
            ))}
          </ChainOfThoughtStep>
        )}
        {sections.map((section) => (
          <ChainOfThoughtStep
            key={section.index}
            icon={STATUS_ICONS[section.status]}
            label={
              <>
                <span className="sr-only">{`${STATUS_LABELS[section.status]}: `}</span>
                {section.title}
              </>
            }
            status={STEP_STATUS[section.status]}
          >
            {events
              .filter((event) => event.sectionIndex === section.index)
              .map((event) => (
                <EventLine key={event.n} event={event} />
              ))}
          </ChainOfThoughtStep>
        ))}
      </ChainOfThoughtContent>
    </ChainOfThought>
  )
}
