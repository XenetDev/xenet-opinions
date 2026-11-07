'use client'

import type { ReportSummary } from '@xo/engine/parts'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ExportButtons } from './export-buttons'
import { type ExportKind, reportMetaLine } from './format'
import { ReportView } from './report-view'
import { SharePopover } from './share-popover'

type SheetProps = {
  summary: ReportSummary
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  onExport?: (kind: ExportKind) => void
  exporting?: ExportKind | null
} & (
  | { readOnly: true; chatId?: string; messageId?: never; shareUrl?: never; onShareUrlChange?: never }
  | {
      readOnly?: false
      chatId: string
      messageId?: string
      shareUrl?: string | null
      onShareUrlChange?: (url: string | null) => void
    }
)

export function ReportSheet({ summary, open, onOpenChange, title, onExport, exporting, ...rest }: SheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="gap-0 data-[side=right]:w-full data-[side=right]:sm:w-[56vw] data-[side=right]:sm:min-w-[640px] data-[side=right]:sm:max-w-none"
      >
        <SheetHeader className="gap-3 border-b px-4 pt-4 pb-3 pr-12 sm:px-6 sm:pr-14">
          <div className="flex flex-col gap-0.5">
            <SheetTitle className="text-base font-semibold text-pretty">{title ?? 'Focus group report'}</SheetTitle>
            <SheetDescription className="text-xs">{reportMetaLine(summary.method)}</SheetDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <ExportButtons onExport={onExport} exporting={exporting} only={rest.readOnly ? ['pdf'] : undefined} />
            {!rest.readOnly && (
              <SharePopover
                chatId={rest.chatId}
                messageId={rest.messageId}
                url={rest.shareUrl}
                onUrlChange={rest.onShareUrlChange}
              />
            )}
          </div>
        </SheetHeader>
        <ReportView
          summary={summary}
          writeup={rest.readOnly}
          className="min-h-0 flex-1"
          listClassName="px-4 sm:px-6"
          contentClassName="min-h-0 overflow-y-auto px-4 pt-4 pb-8 sm:px-6"
        />
      </SheetContent>
    </Sheet>
  )
}
