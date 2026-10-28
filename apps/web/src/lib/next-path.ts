export function sanitiseNext(value: string | null | undefined): string {
  if (!value?.startsWith('/') || value[1] === '/' || value[1] === '\\') return '/'
  if (/[\t\n\r]/.test(value)) return '/'
  if (/^\/sign-in(?:[/?#]|$)/.test(value)) return '/'
  return value
}
