'use client'

import { CheckIcon, PauseIcon, RepeatIcon } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { InputGroupButton } from '@/components/ui/input-group'

export const DEFAULT_ROUNDS = 3

export const defaultRounds = (maxRounds: number) => Math.min(DEFAULT_ROUNDS, maxRounds)
export const roundsLabel = (rounds: number) => (rounds === 1 ? '1 round' : `${rounds} rounds`)

export type RunOptionsValue = { maxRounds: number; pauseForInterviews: boolean }

export function RoundsPicker({
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
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <InputGroupButton size="sm" variant="ghost" disabled={disabled}>
          <RepeatIcon data-icon="inline-start" aria-hidden="true" />
          {roundsLabel(value)}
        </InputGroupButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 w-36">
        <DropdownMenuRadioGroup value={String(value)} onValueChange={(next) => onChange(Number(next))}>
          {Array.from({ length: maxRounds }, (_, index) => index + 1).map((rounds) => (
            <DropdownMenuRadioItem key={rounds} value={String(rounds)}>
              {roundsLabel(rounds)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function PauseToggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <InputGroupButton
      size="sm"
      variant={checked ? 'secondary' : 'ghost'}
      aria-pressed={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      {checked ? (
        <CheckIcon data-icon="inline-start" aria-hidden="true" />
      ) : (
        <PauseIcon data-icon="inline-start" aria-hidden="true" />
      )}
      Pause for interviews
    </InputGroupButton>
  )
}
