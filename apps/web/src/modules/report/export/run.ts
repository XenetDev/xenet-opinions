import type { ReportSummary } from '@xo/engine/parts'
import type { ExportKind } from '../format'
import { type ExportMeta, exportFilename } from './meta'

const REVOKE_AFTER_MS = 1000

const exporters: Record<ExportKind, () => Promise<(summary: ReportSummary, meta: ExportMeta) => Promise<Blob>>> = {
  pdf: async () => (await import('./pdf')).exportPdf,
  docx: async () => (await import('./docx')).exportDocx,
  xlsx: async () => (await import('./xlsx')).exportXlsx,
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.style.display = 'none'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS)
}

export async function runExport(kind: ExportKind, summary: ReportSummary, meta: ExportMeta) {
  const exporter = await exporters[kind]()
  downloadBlob(await exporter(summary, meta), exportFilename(kind, meta))
}
