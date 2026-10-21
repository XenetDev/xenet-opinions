export const MAX_FILES = 5
export const MAX_FILE_BYTES = 10 * 1024 * 1024

const ALLOWED_TYPES = new Set(['application/pdf', 'text/markdown', 'text/plain'])
const EXTENSION_TYPES: Record<string, string> = {
  md: 'text/markdown',
  txt: 'text/plain',
  pdf: 'application/pdf',
}

export type UploadRejection = 'too_many' | 'too_large' | 'bad_type'
export type ValidatedFile = { name: string; mediaType: string; size: number }

function resolveMediaType(name: string, type: string): string {
  const declared = type.split(';')[0]!.trim().toLowerCase()
  if (declared && declared !== 'application/octet-stream') return declared
  const dot = name.lastIndexOf('.')
  return (dot >= 0 && EXTENSION_TYPES[name.slice(dot + 1).toLowerCase()]) || declared
}

export function validateUploads(
  files: Array<{ name: string; type: string; size: number }>,
): { ok: true; files: ValidatedFile[] } | { ok: false; reason: UploadRejection } {
  if (files.length > MAX_FILES) return { ok: false, reason: 'too_many' }
  if (files.some((file) => file.size > MAX_FILE_BYTES)) return { ok: false, reason: 'too_large' }
  const validated = files.map((file) => ({
    name: file.name,
    mediaType: resolveMediaType(file.name, file.type),
    size: file.size,
  }))
  if (validated.some((file) => !ALLOWED_TYPES.has(file.mediaType))) return { ok: false, reason: 'bad_type' }
  return { ok: true, files: validated }
}
