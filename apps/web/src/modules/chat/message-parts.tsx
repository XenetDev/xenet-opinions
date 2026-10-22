import type { OpinionsDataParts, OpinionsUIMessage } from '@xo/engine/parts'
import { MessageResponse } from '@/components/ai-elements/message'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AgentRoster } from './parts/agent-roster'
import { GraphPreview } from './parts/graph-preview'
import { InterviewCard } from './parts/interview-card'
import { OntologyCard } from './parts/ontology-card'
import { PipelineTimeline } from './parts/pipeline-timeline'
import { ReportWorkbench } from './parts/report-workbench'
import { SimulationFeed } from './parts/simulation-feed'
import { SourcesList } from './parts/sources-list'

function lastData<K extends keyof OpinionsDataParts>(parts: OpinionsUIMessage['parts'], key: K): OpinionsDataParts[K] | undefined {
  const match = parts.findLast((part) => part.type === `data-${key}`)
  return match && 'data' in match ? (match.data as OpinionsDataParts[K]) : undefined
}

export function MessageParts({ parts, onRetry }: { parts: OpinionsUIMessage['parts']; onRetry?: () => void }) {
  const stages = parts.flatMap((part) => (part.type === 'data-stage' ? [part.data] : []))
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
  const interviews = [
    ...new Map(parts.flatMap((part) => (part.type === 'data-interview' ? [[part.data.agentId, part.data] as const] : []))).values(),
  ]
  const hasText = texts.length > 0

  return (
    <>
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
      {(outline || reportEvents.length > 0) && (
        <div data-part="workbench">
          <ReportWorkbench outline={outline} events={reportEvents} collapsed={hasText} />
        </div>
      )}
      {texts.map((text, i) => (
        <div key={i} data-part="text">
          <MessageResponse>{text}</MessageResponse>
        </div>
      ))}
      {interviews.length > 0 && (
        <div data-part="interviews" className="flex flex-col gap-2">
          {interviews.map((interview) => (
            <InterviewCard key={interview.agentId} data={interview} />
          ))}
        </div>
      )}
      {errors.map((error, i) => (
        <div key={i} data-part="error">
          <Alert variant="destructive">
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        </div>
      ))}
    </>
  )
}
