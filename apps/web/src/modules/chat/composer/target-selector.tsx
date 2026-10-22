'use client'

import {
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
} from '@/components/ai-elements/prompt-input'

export type FollowUpTarget = 'report' | 'agents'

export function TargetSelector({
  value,
  onChange,
  agentsDisabled,
}: {
  value: FollowUpTarget
  onChange: (value: FollowUpTarget) => void
  agentsDisabled: boolean
}) {
  return (
    <PromptInputSelect value={value} onValueChange={(next) => onChange(next as FollowUpTarget)}>
      <PromptInputSelectTrigger size="sm" aria-label="Follow-up target">
        <PromptInputSelectValue />
      </PromptInputSelectTrigger>
      <PromptInputSelectContent>
        <PromptInputSelectItem value="report">Ask the report</PromptInputSelectItem>
        <PromptInputSelectItem value="agents" disabled={agentsDisabled}>
          Interview personas
        </PromptInputSelectItem>
      </PromptInputSelectContent>
    </PromptInputSelect>
  )
}
