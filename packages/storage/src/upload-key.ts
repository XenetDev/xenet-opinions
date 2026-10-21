const MAX_NAME = 120

const EXTENSIONS: Record<string, string> = {
  'application/pdf': '.pdf',
  'text/markdown': '.md',
  'text/plain': '.txt',
}

export function safeUploadName(filename: string, mediaType?: string): string {
  const ext = (mediaType && EXTENSIONS[mediaType]) || ''
  const safe = filename.replace(/[^A-Za-z0-9._-]/g, '_')
  const hasExt = ext !== '' && safe.toLowerCase().endsWith(ext)
  const stem = hasExt ? safe.slice(0, -ext.length) : safe
  const suffix = hasExt ? safe.slice(-ext.length) : ext
  return (/^\.*$/.test(stem) ? 'file' : stem).slice(0, MAX_NAME - suffix.length) + suffix
}

export function uploadKey(userId: string, uploadId: string, filename: string): string {
  return `uploads/${userId}/${uploadId}/${safeUploadName(filename)}`
}
