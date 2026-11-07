import { NO_VIEW, NOT_CLASSIFIED, type Participant, type ReportSummary } from '@xo/engine/parts'
import { Button } from '@/components/ui/button'
import { ACTION_LABELS, formatScore, groupLabels } from './format'
import { Quote } from './values'

function ParticipantCard({ participant, group }: { participant: Participant; group?: string }) {
  const details = [participant.age !== undefined ? String(participant.age) : null, participant.location ?? null].filter(
    Boolean,
  )
  const action = ACTION_LABELS[participant.action]
  return (
    <li data-testid="participant-card" className="flex flex-col gap-2 rounded-lg border bg-card p-3">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm font-semibold text-foreground">{participant.name}</h3>
        <p className="text-xs text-muted-foreground">
          {[...details, participant.role, group].filter(Boolean).join(' · ')}
        </p>
      </div>
      <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground tabular-nums">
        <span data-testid="participant-sentiment">
          {participant.sentiment === null ? NO_VIEW : `Sentiment ${formatScore(participant.sentiment)}`}
        </span>
        {participant.sentiment !== null && action && <span>{action}</span>}
      </p>
      {participant.opinion && participant.opinion !== NO_VIEW && participant.opinion !== NOT_CLASSIFIED && (
        <p className="text-sm/6 text-foreground">{participant.opinion}</p>
      )}
      {participant.quote && <Quote>{participant.quote}</Quote>}
    </li>
  )
}

export function ParticipantsTab({
  summary,
  filter,
  onFilterChange,
}: {
  summary: ReportSummary
  filter: string | null
  onFilterChange: (group: string | null) => void
}) {
  const labels = groupLabels(summary)
  const shown = filter ? summary.participants.filter((p) => p.group === filter) : summary.participants
  const options = [
    { id: null, label: 'All', count: summary.participants.length },
    ...summary.groups.map((g) => ({
      id: g.id,
      label: g.label,
      count: summary.participants.filter((p) => p.group === g.id).length,
    })),
  ]

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-wrap gap-1.5">
        <legend className="sr-only">Filter by group</legend>
        {options.map((option) => (
          <Button
            key={option.id ?? 'all'}
            size="sm"
            variant={filter === option.id ? 'secondary' : 'ghost'}
            aria-pressed={filter === option.id}
            onClick={() => onFilterChange(option.id)}
          >
            {`${option.label} (${option.count})`}
          </Button>
        ))}
      </fieldset>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((participant) => (
          <ParticipantCard key={participant.agentId} participant={participant} group={labels.get(participant.group)} />
        ))}
      </ul>
    </div>
  )
}
