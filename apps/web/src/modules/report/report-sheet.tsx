'use client'

import type { ReportSummary } from '@xo/engine/parts'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EXPORTS, type ExportKind } from './format'
import { GroupsTab } from './groups-tab'
import { ParticipantsTab } from './participants-tab'
import { SourcesTab } from './sources-tab'
import { SummaryTab } from './summary-tab'
import { WriteupTab } from './writeup-tab'

type SheetProps = {
  summary: ReportSummary
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  onExport?: (kind: ExportKind) => void
} & ({ readOnly: true; chatId?: string; onShare?: never } | { readOnly?: false; chatId: string; onShare?: () => void })

const CONTENT = 'min-h-0 overflow-y-auto px-4 pt-4 pb-8 sm:px-6'

export function ReportSheet({ summary, open, onOpenChange, title, onExport, ...rest }: SheetProps) {
  const { method } = summary
  const onShare = rest.readOnly ? undefined : rest.onShare
  const [group, setGroup] = useState<string | null>(null)
  const tabs = [
    { value: 'summary', label: 'Summary', body: <SummaryTab summary={summary} /> },
    { value: 'groups', label: `Groups (${summary.groups.length})`, body: <GroupsTab summary={summary} /> },
    {
      value: 'participants',
      label: `Participants (${summary.participants.length})`,
      body: <ParticipantsTab summary={summary} filter={group} onFilterChange={setGroup} />,
    },
    { value: 'sources', label: `Sources (${summary.sources.length})`, body: <SourcesTab summary={summary} /> },
    { value: 'writeup', label: 'Full write-up', body: <WriteupTab summary={summary} /> },
  ]

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="gap-0 data-[side=right]:w-full data-[side=right]:sm:w-[56vw] data-[side=right]:sm:min-w-[640px] data-[side=right]:sm:max-w-none"
      >
        <SheetHeader className="gap-3 border-b px-4 pt-4 pb-3 pr-12 sm:px-6 sm:pr-14">
          <div className="flex flex-col gap-0.5">
            <SheetTitle className="text-base font-semibold text-pretty">{title ?? 'Focus group report'}</SheetTitle>
            <SheetDescription className="text-xs">
              {`Simulated focus group · ${method.participants} participants · ${method.groups} groups · ${method.rounds} rounds`}
            </SheetDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {EXPORTS.map(({ kind, label }) => (
              <Button
                key={kind}
                size="sm"
                variant="outline"
                disabled={!onExport}
                onClick={onExport ? () => onExport(kind) : undefined}
              >
                {label}
              </Button>
            ))}
            {!rest.readOnly && (
              <Button size="sm" variant="outline" disabled={!onShare} onClick={onShare}>
                Share
              </Button>
            )}
          </div>
        </SheetHeader>
        <Tabs defaultValue="summary" className="min-h-0 flex-1 gap-0">
          <div className="overflow-x-auto border-b px-4 sm:px-6">
            <TabsList variant="line" className="h-10">
              {tabs.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value} className="flex-none px-2">
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {tabs.map((tab) => (
            <TabsContent key={tab.value} value={tab.value} className={CONTENT}>
              {tab.body}
            </TabsContent>
          ))}
        </Tabs>
      </SheetContent>
    </Sheet>
  )
}
