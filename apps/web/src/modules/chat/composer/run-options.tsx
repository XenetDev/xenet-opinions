'use client'

import { ChevronDownIcon } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { InputGroupButton } from '@/components/ui/input-group'

export const DEFAULT_ROUNDS = 3
export const PAUSE_LABEL = 'Pause for interviews before the report'

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
        <InputGroupButton size="sm" variant="ghost" className="rounded-full" disabled={disabled}>
          {roundsLabel(value)}
          <ChevronDownIcon data-icon="inline-end" aria-hidden="true" />
        </InputGroupButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-72 w-36">
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

export function PauseOption({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <DropdownMenuCheckboxItem
      checked={checked}
      onCheckedChange={(next) => onChange(next === true)}
      onSelect={(event) => event.preventDefault()}
    >
      {PAUSE_LABEL}
    </DropdownMenuCheckboxItem>
  )
}
