import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { EXPORTS, type ExportKind } from './format'

export function ExportButtons({
  onExport,
  exporting,
  only,
}: {
  onExport?: (kind: ExportKind) => void
  exporting?: ExportKind | null
  only?: ExportKind[]
}) {
  return EXPORTS.filter(({ kind }) => !only || only.includes(kind)).map(({ kind, label }) => (
    <Button
      key={kind}
      size="sm"
      variant="outline"
      disabled={!onExport || !!exporting}
      aria-busy={exporting === kind || undefined}
      onClick={onExport ? () => onExport(kind) : undefined}
    >
      {exporting === kind && (
        <Spinner role="presentation" aria-label={undefined} aria-hidden="true" className="motion-reduce:animate-none" />
      )}
      {label}
    </Button>
  ))
}
