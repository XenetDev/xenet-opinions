import type { InterviewData, OpinionsDataParts, OpinionsUIMessage } from '@xo/engine/parts'
import { Bubble, BubbleContent } from '@/components/ui/bubble'
import { Message, MessageContent } from '@/components/ui/message'
import { RunConsole } from './console/run-console'
import { Markdown } from './markdown'
import { AgentRoster } from './parts/agent-roster'
import { GraphPreview } from './parts/graph-preview'
import { InterviewCard } from './parts/interview-card'
import { OntologyCard } from './parts/ontology-card'
import { SimulationFeed } from './parts/simulation-feed'

const CONSOLE_PARTS = new Set<string>([
  'data-stage',
  'data-interview_window',
  'data-report_outline',
  'data-report_event',
  'data-error',
])

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
  onAddActors,
  chatId,
  title,
  windowUntil,
  reportRequested,
  windowLive,
  onCancelRun,
}: {
  parts: OpinionsUIMessage['parts']
  onRetry?: () => void
  onAddActors?: () => void
  chatId?: string
  title?: string
  windowUntil?: string | null
  reportRequested?: boolean
  windowLive?: boolean
  onCancelRun?: () => void
}) {
  const queue = lastData(parts, 'queue')
  const ontology = lastData(parts, 'ontology')
  const graph = lastData(parts, 'graph')
  const agents = lastData(parts, 'agents')
  const feed = lastData(parts, 'sim_feed')
  const texts = parts.flatMap((part) => (part.type === 'text' ? [part.text] : []))
  const interviewGroups = groupInterviews(parts)
  const showConsole = (queue !== undefined && queue.position >= 1) || parts.some((part) => CONSOLE_PARTS.has(part.type))

  return (
    <>
      {showConsole && (
        <div data-part="console">
          <RunConsole
            parts={parts}
            chatId={chatId}
            title={title}
            windowUntil={windowUntil}
            reportRequested={reportRequested}
            windowLive={windowLive}
            onCancelRun={onCancelRun}
            onRetry={onRetry}
            onAddActors={onAddActors}
          />
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
          <SimulationFeed data={feed} agents={agents} />
        </div>
      )}
      {interviewGroups.length > 0 && (
        <div data-part="interviews" className="flex flex-col gap-7">
          {interviewGroups.map(([key, group]) => (
            <section key={key} data-testid="interview-group" className="flex flex-col gap-4">
              {group.question && (
                <Message align="end">
                  <MessageContent className="min-w-0 items-end">
                    <Bubble variant="muted" align="end" className="max-w-[85%]">
                      <BubbleContent>
                        <h3 className="text-sm/6 font-normal sm:text-[15px]/6">{group.question}</h3>
                      </BubbleContent>
                    </Bubble>
                  </MessageContent>
                </Message>
              )}
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
      {texts.map((text, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: text parts have no id and keep their order
        <div key={i} data-part="text">
          <Markdown>{text}</Markdown>
        </div>
      ))}
    </>
  )
}
