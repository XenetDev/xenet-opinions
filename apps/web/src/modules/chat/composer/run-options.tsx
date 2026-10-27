'use client'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export const ROUND_OPTIONS = [1, 2, 3, 5, 10, 20, 40]
export const DEFAULT_ROUNDS = 3

export const defaultRounds = (maxRounds: number) => Math.min(DEFAULT_ROUNDS, maxRounds)

export type RunOptionsValue = { maxRounds: number; pauseForInterviews: boolean }

export function RunOptions({
  value,
  onChange,
  disabled,
  maxRounds = 40,
  allowPause = true,
}: {
  value: RunOptionsValue
  onChange: (value: RunOptionsValue) => void
  disabled?: boolean
  maxRounds?: number
  allowPause?: boolean
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span id="run-options-rounds">Rounds</span>
      <Select
        value={String(value.maxRounds)}
        onValueChange={(next) => onChange({ ...value, maxRounds: Number(next) })}
        disabled={disabled}
      >
        <SelectTrigger size="sm" aria-labelledby="run-options-rounds" className="w-20">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ROUND_OPTIONS.filter((rounds) => rounds <= maxRounds).map((rounds) => (
            <SelectItem key={rounds} value={String(rounds)}>
              {rounds}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {allowPause && (
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            className="size-3.5 accent-primary"
            checked={value.pauseForInterviews}
            disabled={disabled}
            onChange={(event) => onChange({ ...value, pauseForInterviews: event.target.checked })}
          />
          Pause for interviews before the report
        </label>
      )}
    </div>
  )
}
