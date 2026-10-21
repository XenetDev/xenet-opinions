import { BanIcon, CheckCircle2Icon, CircleDashedIcon, XCircleIcon } from 'lucide-react'
import { STAGES, type Stage, type StageData, type StageStatus } from '@xo/engine/parts'
import { Shimmer } from '@/components/ai-elements/shimmer'
import { Task, TaskContent, TaskItem, TaskTrigger } from '@/components/ai-elements/task'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const STAGE_TITLES: Record<Stage, string> = {
  ontology: 'Reading your documents',
  graph_build: 'Building the knowledge graph',
  sim_create: 'Creating the simulation',
  sim_prepare: 'Generating personas',
  sim_run: 'Running the simulation',
  report: 'Writing the report',
  finished: 'Done',
}

const STATUS_LABELS: Record<StageStatus, string> = {
  pending: 'Pending',
  running: 'Running',
  done: 'Done',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

function StageHeading({ status, title }: { status: StageStatus; title: string }) {
  return (
    <>
      {status === 'done' && <CheckCircle2Icon aria-hidden className="size-4 text-emerald-600" />}
      {status === 'failed' && <XCircleIcon aria-hidden className="size-4" />}
      {status === 'cancelled' && <BanIcon aria-hidden className="size-4" />}
      {(status === 'pending' || status === 'running') && (
        <CircleDashedIcon aria-hidden className="size-4" />
      )}
      {status === 'running' ? <Shimmer as="span">{title}</Shimmer> : <span>{title}</span>}
      <span className="sr-only">{STATUS_LABELS[status]}</span>
    </>
  )
}

export function PipelineTimeline({ stages, onRetry }: { stages: StageData[]; onRetry?: () => void }) {
  const byStage = new Map(stages.map((data) => [data.stage, data]))

  return (
    <div className="flex flex-col gap-3">
      {STAGES.map((stage) => {
        const data = byStage.get(stage)
        const status = data?.status ?? 'pending'
        const title = STAGE_TITLES[stage]
        const tone = cn(
          'flex w-full items-center gap-2 text-sm',
          (status === 'pending' || status === 'cancelled') && 'text-muted-foreground',
          status === 'failed' && 'text-destructive',
        )
        const rowProps = { 'data-testid': 'stage-row', 'data-status': status }

        if (status === 'failed') {
          return (
            <div key={stage} {...rowProps} className="flex flex-col gap-1">
              <div className={tone}>
                <StageHeading status={status} title={title} />
              </div>
              {data?.message && <p className="pl-6 text-sm text-destructive">{data.message}</p>}
              {onRetry && (
                <div className="pl-6">
                  <Button type="button" variant="outline" size="sm" onClick={onRetry}>
                    Retry from here
                  </Button>
                </div>
              )}
            </div>
          )
        }

        if (!data?.message) {
          return (
            <div key={stage} {...rowProps} className={tone}>
              <StageHeading status={status} title={title} />
            </div>
          )
        }

        return (
          <Task key={stage} {...rowProps}>
            <TaskTrigger title={title}>
              <button type="button" className={cn(tone, 'cursor-pointer')}>
                <StageHeading status={status} title={title} />
              </button>
            </TaskTrigger>
            <TaskContent>
              <TaskItem>{data.message}</TaskItem>
            </TaskContent>
          </Task>
        )
      })}
    </div>
  )
}
