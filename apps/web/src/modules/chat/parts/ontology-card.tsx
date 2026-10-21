import { BrainIcon, ChevronDownIcon } from 'lucide-react'
import type { OntologyData } from '@xo/engine/parts'
import { Reasoning, ReasoningContent, ReasoningTrigger } from '@/components/ai-elements/reasoning'
import { Badge } from '@/components/ui/badge'

function Chips({ label, items, variant }: { label: string; items: string[]; variant: 'secondary' | 'outline' }) {
  if (items.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      {items.map((item) => (
        <Badge key={item} variant={variant} data-testid="ontology-chip">
          {item}
        </Badge>
      ))}
    </div>
  )
}

export function OntologyCard({ data }: { data: OntologyData }) {
  return (
    <Reasoning defaultOpen={false} className="mb-0 flex flex-col gap-2">
      <ReasoningTrigger>
        <BrainIcon aria-hidden className="size-4" />
        <span>What I found in your documents</span>
        {data.summary && <ChevronDownIcon aria-hidden className="size-4" />}
      </ReasoningTrigger>
      <Chips label="Entities" items={data.entityTypes} variant="secondary" />
      <Chips label="Relations" items={data.relationTypes} variant="outline" />
      {data.summary && <ReasoningContent className="mt-0">{data.summary}</ReasoningContent>}
    </Reasoning>
  )
}
