'use client'

import { useId, useState } from 'react'
import { Badge } from '@/components/reui/badge'
import { Frame, FrameDescription, FrameFooter, FrameHeader, FramePanel, FrameTitle } from '@/components/reui/frame'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'

export type SeedContext = { background?: string; actors?: string; change?: string }

const FIELDS = [
  { key: 'background', label: 'Background and constraints', placeholder: 'The rules, numbers and history that matter' },
  { key: 'actors', label: 'Who should be simulated', placeholder: 'Customers, staff, competitors, the press…' },
  { key: 'change', label: 'What is changing', placeholder: 'The decision or event you want to test' },
] as const

export const SEED_FIELD_MAX = 2000

export function ContextCard({
  onStart,
  onSkip,
  pending,
}: {
  onStart: (seed: SeedContext) => void
  onSkip: () => void
  pending: boolean
}) {
  const id = useId()
  const [values, setValues] = useState<Record<keyof SeedContext, string>>({ background: '', actors: '', change: '' })

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
            <FrameTitle id={`${id}-title`}>A little more context helps the simulation</FrameTitle>
            <Badge variant="warning-light" className="ms-auto shrink-0 font-normal">
              Needs you
            </Badge>
          </div>
          <FrameDescription>Optional. MiroFish simulates better when it knows the situation.</FrameDescription>
        </FrameHeader>
        <FramePanel>
          <FieldGroup className="gap-4">
            {FIELDS.map(({ key, label, placeholder }) => (
              <Field key={key}>
                <FieldLabel htmlFor={`${id}-${key}`}>{label}</FieldLabel>
                <Textarea
                  id={`${id}-${key}`}
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
          <Button type="button" variant="outline" disabled={pending} onClick={() => onSkip()}>
            Skip and run with my question
          </Button>
          <Button type="button" disabled={pending} onClick={start}>
            Start run
          </Button>
        </FrameFooter>
      </Frame>
    </section>
  )
}
