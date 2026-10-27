export type FollowUpTarget = 'report' | 'agents'

export function TargetSelector({ value }: { value: FollowUpTarget }) {
  return (
    <span className="px-2 text-xs text-muted-foreground">
      {value === 'agents' ? 'Interview personas' : 'Ask the report'}
    </span>
  )
}
