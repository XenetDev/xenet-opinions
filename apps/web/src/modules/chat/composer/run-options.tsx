'use client'

import { useId } from 'react'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

export const DEFAULT_ROUNDS = 3

export const defaultRounds = (maxRounds: number) => Math.min(DEFAULT_ROUNDS, maxRounds)
export const roundsLabel = (rounds: number) => (rounds === 1 ? '1 round' : `${rounds} rounds`)

export type RunOptionsValue = { maxRounds: number; pauseForInterviews: boolean }

export function RoundsRow({
  value,
  onChange,
  maxRounds,
  disabled,
}: {
  value: number
  onChange: (rounds: number) => void
  maxRounds: number
  disabled?: boolean
}) {
  const id = useId()
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-col gap-0.5">
        <Label htmlFor={id}>Rounds</Label>
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          How many rounds participants post and reply in the simulation.
        </p>
      </div>
      <Select value={String(value)} onValueChange={(next) => onChange(Number(next))} disabled={disabled}>
        <SelectTrigger id={id} size="sm" aria-describedby={`${id}-hint`} className="shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" align="end" className="max-h-72">
          {Array.from({ length: maxRounds }, (_, index) => index + 1).map((rounds) => (
            <SelectItem key={rounds} value={String(rounds)}>
              {roundsLabel(rounds)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export function PauseRow({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  const id = useId()
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-col gap-0.5">
        <Label htmlFor={id}>Pause for interviews</Label>
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          Stops after the simulation so you can question participants before the report.
        </p>
      </div>
      <Switch
        id={id}
        aria-describedby={`${id}-hint`}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
      />
    </div>
  )
}
