'use client'

import {
  PANEL_AUDIENCE_MAX,
  PANEL_GROUPS,
  PANEL_MIN_PARTICIPANTS,
  type Panel,
  type PanelGroupId,
  PLANS,
  type PlanId,
} from '@xo/engine/policy'
import { CheckIcon, ChevronDownIcon, MinusIcon, PlusIcon, Settings2Icon } from 'lucide-react'
import Link from 'next/link'
import { Fragment, useCallback, useEffect, useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { PauseRow, RoundsRow, type RunOptionsValue, roundsLabel } from './run-options'

export const PANEL_STORAGE_KEY = 'xo.panel'

const DEFAULT_PARTICIPANTS = 20
const AUDIENCE_SUMMARY_MAX = 40
const GROUP_IDS = new Set<string>(PANEL_GROUPS.map((group) => group.id))
const UPGRADES = ['starter', 'pro'] as const

export const defaultPanel = (maxParticipants: number, webResearchAvailable: boolean): Panel => ({
  participants: Math.min(DEFAULT_PARTICIPANTS, maxParticipants),
  groups: [],
  webResearch: webResearchAvailable,
})

export function clampPanel(value: unknown, maxParticipants: number, webResearchAvailable: boolean): Panel {
  const fallback = defaultPanel(maxParticipants, webResearchAvailable)
  if (!value || typeof value !== 'object') return fallback
  const stored = value as Partial<Record<keyof Panel, unknown>>
  const participants =
    typeof stored.participants === 'number' && Number.isFinite(stored.participants)
      ? Math.min(Math.max(Math.round(stored.participants), PANEL_MIN_PARTICIPANTS), maxParticipants)
      : fallback.participants
  const groups = Array.isArray(stored.groups)
    ? [...new Set(stored.groups.filter((id): id is PanelGroupId => typeof id === 'string' && GROUP_IDS.has(id)))]
    : []
  const audience = typeof stored.audience === 'string' ? stored.audience.trim().slice(0, PANEL_AUDIENCE_MAX) : ''
  return {
    participants,
    ...(audience && { audience }),
    groups: groups.slice(0, participants),
    webResearch: typeof stored.webResearch === 'boolean' ? stored.webResearch : fallback.webResearch,
  }
}

const readStored = (): unknown => {
  try {
    return JSON.parse(window.localStorage.getItem(PANEL_STORAGE_KEY) ?? 'null')
  } catch {
    return null
  }
}

export function usePanel(maxParticipants: number, webResearchAvailable: boolean) {
  const [panel, setPanel] = useState(() => defaultPanel(maxParticipants, webResearchAvailable))
  useEffect(() => {
    setPanel(clampPanel(readStored(), maxParticipants, webResearchAvailable))
  }, [maxParticipants, webResearchAvailable])
  const update = useCallback((next: Panel) => {
    setPanel(next)
    try {
      window.localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(next))
    } catch {}
  }, [])
  return [panel, update] as const
}

export const panelMinutes = (participants: number, rounds: number) => Math.ceil(participants / 10) + rounds

export function panelSummary(panel: Panel, rounds: number, webResearchAvailable: boolean, pause = false): string {
  const audience = panel.audience?.trim()
  const groups = panel.groups.length
  return [
    `about ${panel.participants} participants`,
    ...(audience
      ? [audience.length > AUDIENCE_SUMMARY_MAX ? `${audience.slice(0, AUDIENCE_SUMMARY_MAX).trimEnd()}…` : audience]
      : []),
    ...(groups > 0 ? [groups === 1 ? '1 group' : `${groups} groups`] : []),
    roundsLabel(rounds),
    ...(webResearchAvailable ? [`web research ${panel.webResearch ? 'on' : 'off'}`] : []),
    ...(pause ? ['pause on'] : []),
    `~${panelMinutes(panel.participants, rounds)} min`,
  ].join(' · ')
}

function PlanHint({ plan, maxParticipants }: { plan?: PlanId; maxParticipants: number }) {
  const upgrades = UPGRADES.filter((id) => PLANS[id].maxParticipants > maxParticipants)
  const allowance = !plan
    ? `Up to ${maxParticipants}.`
    : plan === 'guest'
      ? `Guests get up to ${maxParticipants}.`
      : `${PLANS[plan].name} allows up to ${maxParticipants}.`
  return (
    <p className="text-xs text-muted-foreground">
      {allowance}
      {upgrades.map((id, index) => (
        <Fragment key={id}>
          {index === 0 ? ' ' : ', '}
          <Link href="/pricing" className="font-medium text-foreground underline underline-offset-2">
            {PLANS[id].name}
          </Link>
          {` allows ${PLANS[id].maxParticipants}`}
        </Fragment>
      ))}
      {upgrades.length > 0 && '.'} We aim for about this many; the final cast can differ by a few.
    </p>
  )
}

export function ConfigurePanel({
  value,
  onChange,
  maxParticipants,
  webResearchAvailable,
  runOptions,
  onRunOptionsChange,
  maxRounds,
  allowPause,
  plan,
  disabled,
  open,
  onOpenChange,
}: {
  value: Panel
  onChange: (panel: Panel) => void
  maxParticipants: number
  webResearchAvailable: boolean
  runOptions: RunOptionsValue
  onRunOptionsChange: (runOptions: RunOptionsValue) => void
  maxRounds: number
  allowPause: boolean
  plan?: PlanId
  disabled?: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const id = useId()
  const rounds = runOptions.maxRounds
  const setParticipants = (participants: number) => {
    const next = Math.min(Math.max(participants, PANEL_MIN_PARTICIPANTS), maxParticipants)
    onChange({ ...value, participants: next, groups: value.groups.slice(0, next) })
  }
  const toggleGroup = (group: PanelGroupId) =>
    onChange({
      ...value,
      groups: value.groups.includes(group) ? value.groups.filter((g) => g !== group) : [...value.groups, group],
    })
  const groupsFull = value.groups.length >= value.participants

  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" disabled={disabled}>
            <Settings2Icon data-icon="inline-start" aria-hidden="true" />
            Configure
            <ChevronDownIcon
              data-icon="inline-end"
              aria-hidden="true"
              className={open ? 'rotate-180 transition-transform' : 'transition-transform'}
            />
          </Button>
        </CollapsibleTrigger>
        <p data-testid="panel-summary" className="px-2 text-xs text-muted-foreground tabular-nums">
          {panelSummary(value, rounds, webResearchAvailable, allowPause && runOptions.pauseForInterviews)}
        </p>
      </div>
      <CollapsibleContent className="flex flex-col gap-4 rounded-xl border bg-card p-3.5">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Participants</span>
            <span className="text-xs text-muted-foreground">~{panelMinutes(value.participants, rounds)} min</span>
          </div>
          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Fewer participants"
              disabled={disabled || value.participants <= PANEL_MIN_PARTICIPANTS}
              onClick={() => setParticipants(value.participants - 1)}
            >
              <MinusIcon aria-hidden="true" />
            </Button>
            <Slider
              aria-label="Participants"
              min={PANEL_MIN_PARTICIPANTS}
              max={maxParticipants}
              step={1}
              value={[value.participants]}
              onValueChange={([next]) => next !== undefined && setParticipants(next)}
              disabled={disabled}
              className="flex-1"
            />
            <span className="w-6 text-right text-sm font-medium tabular-nums">{value.participants}</span>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="More participants"
              disabled={disabled || value.participants >= maxParticipants}
              onClick={() => setParticipants(value.participants + 1)}
            >
              <PlusIcon aria-hidden="true" />
            </Button>
          </div>
          <PlanHint plan={plan} maxParticipants={maxParticipants} />
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline gap-1">
            <Label htmlFor={`${id}-audience`}>Audience</Label>
            <span className="text-xs text-muted-foreground">(optional)</span>
          </div>
          <Input
            id={`${id}-audience`}
            value={value.audience ?? ''}
            maxLength={PANEL_AUDIENCE_MAX}
            disabled={disabled}
            placeholder="e.g. German Corolla owners aged 30–60, fleet managers at mid-size firms"
            onChange={(event) => {
              const { audience: _, ...rest } = value
              onChange(event.target.value ? { ...rest, audience: event.target.value } : rest)
            }}
          />
        </div>
        <fieldset className="flex min-w-0 flex-col gap-1.5">
          <legend className="mb-1.5 flex items-baseline gap-1">
            <span className="text-sm font-medium">Groups to include</span>
            <span className="text-xs text-muted-foreground">(optional, each gets at least one participant)</span>
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {PANEL_GROUPS.map((group) => {
              const selected = value.groups.includes(group.id)
              return (
                <Button
                  key={group.id}
                  variant={selected ? 'secondary' : 'outline'}
                  size="xs"
                  className="rounded-full"
                  aria-pressed={selected}
                  disabled={disabled || (!selected && groupsFull)}
                  onClick={() => toggleGroup(group.id)}
                >
                  {selected && <CheckIcon data-icon="inline-start" aria-hidden="true" />}
                  {group.label}
                </Button>
              )
            })}
          </div>
          {groupsFull && value.groups.length < PANEL_GROUPS.length && (
            <p className="text-xs text-muted-foreground">
              Each group needs at least one participant. Add participants to include more groups.
            </p>
          )}
        </fieldset>
        {webResearchAvailable && (
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <Label htmlFor={`${id}-research`}>Web research</Label>
              <p id={`${id}-research-hint`} className="text-xs text-muted-foreground">
                Searches the web for current prices, competitors and news, and cites them in the report.
              </p>
            </div>
            <Switch
              id={`${id}-research`}
              aria-describedby={`${id}-research-hint`}
              checked={value.webResearch}
              disabled={disabled}
              onCheckedChange={(webResearch) => onChange({ ...value, webResearch })}
            />
          </div>
        )}
        <RoundsRow
          value={rounds}
          onChange={(maxRounds) => onRunOptionsChange({ ...runOptions, maxRounds })}
          maxRounds={maxRounds}
          disabled={disabled}
        />
        {allowPause && (
          <PauseRow
            checked={runOptions.pauseForInterviews}
            onChange={(pauseForInterviews) => onRunOptionsChange({ ...runOptions, pauseForInterviews })}
            disabled={disabled}
          />
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}
