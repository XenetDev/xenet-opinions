'use client'

import type { ReportSummary } from '@xo/engine/parts'
import { cn } from 'cn'
import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { GroupsTab } from './groups-tab'
import { ParticipantsTab } from './participants-tab'
import { SourcesTab } from './sources-tab'
import { SummaryTab } from './summary-tab'
import { WriteupTab } from './writeup-tab'

export function ReportView({
  summary,
  className,
  listClassName,
  contentClassName,
}: {
  summary: ReportSummary
  className?: string
  listClassName?: string
  contentClassName?: string
}) {
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
    <Tabs defaultValue="summary" className={cn('gap-0', className)}>
      <div className={cn('overflow-x-auto border-b', listClassName)}>
        <TabsList variant="line" className="h-10">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="flex-none px-2">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value} className={contentClassName}>
          {tab.body}
        </TabsContent>
      ))}
    </Tabs>
  )
}
