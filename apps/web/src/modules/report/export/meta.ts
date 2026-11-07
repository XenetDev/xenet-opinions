import type { ExportKind } from '../format'

export type ExportMeta = { title: string; date: Date; exported?: boolean }

export const MIME_TYPES: Record<ExportKind, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

const MAX_SLUG = 60
const FOLDS: Record<string, string> = { ß: 'ss', æ: 'ae', œ: 'oe', ø: 'o', ð: 'd', þ: 'th', ł: 'l', đ: 'd' }

export const slugify = (title: string) => {
  const ascii = title
    .toLowerCase()
    .replace(/[ßæœøðþłđ]/g, (c) => FOLDS[c] ?? c)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
  const slug = ascii.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  const head = slug.slice(0, MAX_SLUG + 1)
  const capped =
    slug.length <= MAX_SLUG ? slug : head.includes('-') ? head.replace(/-[^-]*$/, '') : slug.slice(0, MAX_SLUG)
  return capped || 'report'
}

const pad = (n: number) => String(n).padStart(2, '0')

export const isoDate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

export const longDate = (date: Date) =>
  date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

export const exportFilename = (kind: ExportKind, meta: ExportMeta) =>
  `opinions-${slugify(meta.title)}-${isoDate(meta.date)}.${kind}`
