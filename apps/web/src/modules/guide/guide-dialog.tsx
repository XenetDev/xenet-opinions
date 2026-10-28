'use client'

import { type KeyboardEvent, useState } from 'react'
import { Stepper, StepperIndicator, StepperItem, StepperSeparator, StepperTrigger } from '@/components/reui/stepper'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { GUIDE_STEPS } from './guide-steps'

const LAST = GUIDE_STEPS.length - 1

export function GuideDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [index, setIndex] = useState(0)
  const step = GUIDE_STEPS[index]

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    if (event.altKey || event.ctrlKey || event.metaKey) return
    if (event.target instanceof HTMLElement && event.target.closest('input, textarea, [contenteditable]')) return
    event.preventDefault()
    const next = Math.min(Math.max(index + (event.key === 'ArrowRight' ? 1 : -1), 0), LAST)
    setIndex(next)
    if (event.target instanceof HTMLElement && event.target.getAttribute('role') === 'tab') {
      document.getElementById(`stepper-tab-${next + 1}`)?.focus()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        overlayClassName="backdrop-blur-sm supports-backdrop-filter:backdrop-blur-sm"
        className="max-w-[calc(100%-2rem)] gap-0 p-0 sm:max-w-[40rem]"
        onCloseAutoFocus={() => setIndex(0)}
        onKeyDown={onKeyDown}
      >
        <DialogTitle className="sr-only">How Xenet Opinions works</DialogTitle>
        {step && (
          <div
            id="guide-stage"
            role="tabpanel"
            aria-labelledby={`stepper-tab-${index + 1}`}
            className="flex min-w-0 flex-col gap-1.5 px-4 pt-11 sm:px-5"
          >
            <step.Scene active={open} />
            <h2 className="mt-3 text-lg font-semibold">{step.title}</h2>
            <p className="min-h-10 text-sm text-muted-foreground">{step.body}</p>
          </div>
        )}
        <div className="flex items-center gap-4 p-4 sm:p-5">
          <Stepper
            value={index + 1}
            onValueChange={(value) => setIndex(value - 1)}
            className="group/stepper-nav flex max-w-40"
          >
            {GUIDE_STEPS.map((item, i) => (
              <StepperItem key={item.title} step={i + 1}>
                <StepperTrigger aria-label={item.title} aria-controls="guide-stage">
                  <StepperIndicator>{i + 1}</StepperIndicator>
                </StepperTrigger>
                {i < LAST && <StepperSeparator />}
              </StepperItem>
            ))}
          </Stepper>
          <div className="ms-auto flex gap-2">
            <Button variant="outline" disabled={index === 0} onClick={() => setIndex(index - 1)}>
              Back
            </Button>
            {index < LAST ? (
              <Button onClick={() => setIndex(index + 1)}>Next</Button>
            ) : (
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
