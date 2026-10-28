import type { OntologyData } from '@xo/engine/parts'
import { BrainIcon, ChevronRightIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

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
    <Collapsible>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="-ms-2 h-7 gap-1.5 px-2 text-[13px] font-normal text-muted-foreground hover:text-foreground"
        >
          <ChevronRightIcon
            aria-hidden="true"
            className="size-3.5 shrink-0 transition-transform in-data-open:rotate-90 motion-reduce:transition-none"
          />
          <BrainIcon aria-hidden="true" className="size-3.5 shrink-0" />
          What I found in your documents
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-top-1 data-open:duration-200 motion-reduce:data-open:animate-none">
        <div className="ms-2 mt-1.5 flex flex-col gap-2 border-s border-border ps-3.5 text-[13px]/5">
          <Chips label="Entities" items={data.entityTypes} variant="secondary" />
          <Chips label="Relations" items={data.relationTypes} variant="outline" />
          {data.summary && <p className="max-w-[64ch] text-muted-foreground">{data.summary}</p>}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
