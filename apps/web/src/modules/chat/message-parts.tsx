import type { InterviewData, OpinionsDataParts, OpinionsUIMessage } from '@xo/engine/parts'
import { MessageResponse } from '@/components/ai-elements/message'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AgentRoster } from './parts/agent-roster'
import { GraphPreview } from './parts/graph-preview'
import { InterviewCard } from './parts/interview-card'
import { InterviewWindowCard } from './parts/interview-window-card'
import { OntologyCard } from './parts/ontology-card'
import { PipelineTimeline } from './parts/pipeline-timeline'
import { QueueCard } from './parts/queue-card'
import { ReportWorkbench } from './parts/report-workbench'
import { SimulationFeed } from './parts/simulation-feed'
import { SourcesList } from './parts/sources-list'

function lastData<K extends keyof OpinionsDataParts>(
  parts: OpinionsUIMessage['parts'],
  key: K,
): OpinionsDataParts[K] | undefined {
  const match = parts.findLast((part) => part.type === `data-${key}`)
  return match && 'data' in match ? (match.data as OpinionsDataParts[K]) : undefined
}

function groupInterviews(parts: OpinionsUIMessage['parts']) {
  const latest = new Map<string, InterviewData>()
  for (const part of parts) {
    if (part.type !== 'data-interview') continue
    latest.set(part.data.id ?? `legacy:${part.data.agentId}`, part.data)
  }
  const groups = new Map<string, { question?: string; interviews: InterviewData[] }>()
  for (const interview of latest.values()) {
    const key = interview.questionId ?? ''
    const group = groups.get(key) ?? { question: interview.questionId && interview.question, interviews: [] }
    group.interviews.push(interview)
    groups.set(key, group)
  }
  return [...groups.entries()]
}

export function MessageParts({
  parts,
  onRetry,
  chatId,
  windowUntil,
  reportRequested,
  windowLive,
  onCancelRun,
}: {
  parts: OpinionsUIMessage['parts']
  onRetry?: () => void
  chatId?: string
  windowUntil?: string | null
  reportRequested?: boolean
  windowLive?: boolean
  onCancelRun?: () => void
}) {
  const stages = parts.flatMap((part) => (part.type === 'data-stage' ? [part.data] : []))
  const queue = lastData(parts, 'queue')
  const sources = lastData(parts, 'sources')
  const ontology = lastData(parts, 'ontology')
  const graph = lastData(parts, 'graph')
  const agents = lastData(parts, 'agents')
  const feed = lastData(parts, 'sim_feed')
  const outline = lastData(parts, 'report_outline')
  const reportEvents = parts
    .flatMap((part) => (part.type === 'data-report_event' ? [part.data] : []))
    .sort((a, b) => a.n - b.n)
  const texts = parts.flatMap((part) => (part.type === 'text' ? [part.text] : []))
  const errors = parts.flatMap((part) => (part.type === 'data-error' ? [part.data] : []))
  const interviewWindow = lastData(parts, 'interview_window')
  const interviewGroups = groupInterviews(parts)
  const hasText = texts.length > 0

  return (
    <>
      {queue && queue.position >= 1 && stages.length === 0 && (
        <div data-part="queue">
          <QueueCard data={queue} />
        </div>
      )}
      {sources && (
        <div data-part="sources">
          <SourcesList data={sources} />
        </div>
      )}
      {stages.length > 0 && (
        <div data-part="timeline">
          <PipelineTimeline stages={stages} onRetry={onRetry} />
        </div>
      )}
      {ontology && (
        <div data-part="ontology">
          <OntologyCard data={ontology} />
        </div>
      )}
      {graph && (
        <div data-part="graph">
          <GraphPreview data={graph} />
        </div>
      )}
      {agents && (
        <div data-part="agents">
          <AgentRoster data={agents} />
        </div>
      )}
      {feed && (
        <div data-part="feed">
          <SimulationFeed data={feed} />
        </div>
      )}
      {(interviewWindow || interviewGroups.length > 0) && (
        <div data-part="interviews" className="flex flex-col gap-4">
          {interviewWindow && (
            <InterviewWindowCard
              data={interviewWindow}
              chatId={chatId}
              until={windowUntil}
              reportRequested={reportRequested}
              live={windowLive}
              onCancel={onCancelRun}
            />
          )}
          {interviewGroups.map(([key, group]) => (
            <section key={key} data-testid="interview-group" className="flex flex-col gap-2">
              {group.question && <h3 className="text-sm font-medium">{group.question}</h3>}
              {group.interviews.map((interview) => (
                <InterviewCard
                  key={interview.id ?? interview.agentId}
                  data={interview}
                  showQuestion={!group.question}
                />
              ))}
            </section>
          ))}
        </div>
      )}
      {(outline || reportEvents.length > 0) && (
        <div data-part="workbench">
          <ReportWorkbench outline={outline} events={reportEvents} collapsed={hasText} />
        </div>
      )}
      {texts.map((text, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: text parts have no id and keep their order
        <div key={i} data-part="text">
          <MessageResponse>{text}</MessageResponse>
        </div>
      ))}
      {errors.map((error, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: error parts have no id and keep their order
        <div key={i} data-part="error">
          <Alert variant="destructive">
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        </div>
      ))}
    </>
  )
}
