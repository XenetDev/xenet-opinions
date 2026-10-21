'use client'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export const ROUND_OPTIONS = [1, 2, 3, 5, 10, 20, 40]
export const DEFAULT_ROUNDS = 3

export type RunOptionsValue = { maxRounds: number }

export function RunOptions({
  value,
  onChange,
  disabled,
}: {
  value: RunOptionsValue
  onChange: (value: RunOptionsValue) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
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
          {ROUND_OPTIONS.map((rounds) => (
            <SelectItem key={rounds} value={String(rounds)}>
              {rounds}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
