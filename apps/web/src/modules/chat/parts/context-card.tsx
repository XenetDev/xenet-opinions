'use client'

import { SEED_FIELD_MAX } from '@xo/engine/policy'
import { useEffect, useId, useRef, useState } from 'react'
import { Badge } from '@/components/reui/badge'
import { Frame, FrameDescription, FrameFooter, FrameHeader, FramePanel, FrameTitle } from '@/components/reui/frame'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { useAnnounce } from '../notice-region'

export type SeedContext = { background?: string; actors?: string; change?: string }

const FIELDS = [
  { key: 'background', label: 'Background and constraints', placeholder: 'The rules, numbers and history that matter' },
  { key: 'actors', label: 'Who should be simulated', placeholder: 'Customers, staff, competitors, the press…' },
  { key: 'change', label: 'What is changing', placeholder: 'The decision or event you want to test' },
] as const

export function ContextCard({
  onStart,
  onSkip,
  pending,
  initial,
}: {
  onStart: (seed: SeedContext) => void
  onSkip: () => void
  pending: boolean
  initial?: SeedContext
}) {
  const id = useId()
  const first = useRef<HTMLTextAreaElement>(null)
  useAnnounce(initial ? 'We drafted who to simulate. Check these and run.' : 'Add context or start the run')
  useEffect(() => first.current?.focus(), [])
  const [values, setValues] = useState<Record<keyof SeedContext, string>>({
    background: initial?.background ?? '',
    actors: initial?.actors ?? '',
    change: initial?.change ?? '',
  })

  const start = () => {
    const seed: SeedContext = {}
    for (const { key } of FIELDS) {
      const value = values[key].trim()
      if (value) seed[key] = value
    }
    onStart(seed)
  }

  return (
    <section aria-labelledby={`${id}-title`} className="w-full" data-testid="context-card">
      <Frame dense stacked spacing="default" className="w-full">
        <FrameHeader>
          <div className="flex flex-row items-center gap-2">
            <FrameTitle id={`${id}-title`}>
              {initial ? 'We drafted who to simulate' : 'A little more context helps the simulation'}
            </FrameTitle>
            <Badge variant="warning-light" className="ms-auto shrink-0 font-normal">
              Needs you
            </Badge>
          </div>
          <FrameDescription>
            {initial
              ? "Check these and run. Edit anything that's wrong."
              : 'Optional. MiroFish simulates better when it knows the situation.'}
          </FrameDescription>
        </FrameHeader>
        <FramePanel>
          <FieldGroup className="gap-4">
            {FIELDS.map(({ key, label, placeholder }, index) => (
              <Field key={key}>
                <FieldLabel htmlFor={`${id}-${key}`}>{label}</FieldLabel>
                <Textarea
                  id={`${id}-${key}`}
                  ref={index === 0 ? first : undefined}
                  value={values[key]}
                  onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))}
                  placeholder={placeholder}
                  maxLength={SEED_FIELD_MAX}
                  disabled={pending}
                  className="max-h-40"
                />
              </Field>
            ))}
          </FieldGroup>
        </FramePanel>
        <FrameFooter className="flex-row flex-wrap justify-end gap-2">
          {!initial && (
            <Button type="button" variant="outline" disabled={pending} onClick={() => onSkip()}>
              Skip and run with my question
            </Button>
          )}
          <Button type="button" disabled={pending} onClick={start}>
            {initial ? 'Run with these' : 'Start run'}
          </Button>
        </FrameFooter>
      </Frame>
    </section>
  )
}
