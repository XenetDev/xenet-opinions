'use client'

import { useCallback, useRef, useState } from 'react'
import { MAX_FILES, validateUploads } from '@/server/upload-rules'

export type PendingFile = {
  localId: string
  file: File
  status: 'pending' | 'uploading' | 'done' | 'error'
  uploadId?: string
  error?: string
}

type UploadResponse = { uploads?: Array<{ id: string }>; reason?: string; error?: string }

export function useUploads(chatId: string, deps: { fetch?: typeof fetch } = {}) {
  const [files, setFilesState] = useState<PendingFile[]>([])
  const filesRef = useRef<PendingFile[]>([])
  const fetchImpl = deps.fetch

  const setFiles = useCallback((update: (prev: PendingFile[]) => PendingFile[]) => {
    filesRef.current = update(filesRef.current)
    setFilesState(filesRef.current)
  }, [])

  const add = useCallback(
    (incoming: File[]) => {
      setFiles((prev) => {
        let accepted = prev.filter((f) => f.status !== 'error').length
        const added = incoming.map((file): PendingFile => {
          const localId = crypto.randomUUID()
          const result = accepted >= MAX_FILES ? ({ ok: false, reason: 'too_many' } as const) : validateUploads([file])
          if (!result.ok) return { localId, file, status: 'error', error: result.reason }
          accepted += 1
          return { localId, file, status: 'pending' }
        })
        return [...prev, ...added]
      })
    },
    [setFiles],
  )

  const remove = useCallback(
    (localId: string) => setFiles((prev) => prev.filter((f) => f.localId !== localId)),
    [setFiles],
  )

  const reset = useCallback(() => setFiles(() => []), [])

  const uploadAll = useCallback(async (): Promise<string[]> => {
    const pending = filesRef.current.filter((f) => f.status === 'pending')
    if (pending.length > 0) {
      const ids = new Set(pending.map((f) => f.localId))
      const mark = (patch: (f: PendingFile, index: number) => Partial<PendingFile>) =>
        setFiles((prev) => {
          let index = -1
          return prev.map((f) => (ids.has(f.localId) ? { ...f, ...patch(f, ++index) } : f))
        })
      mark(() => ({ status: 'uploading', error: undefined }))
      const form = new FormData()
      form.append('chatId', chatId)
      for (const { file } of pending) form.append('files', file)
      let reason = 'upload_failed'
      try {
        const response = await (fetchImpl ?? fetch)('/api/uploads', { method: 'POST', body: form })
        const data = (await response.json().catch(() => ({}))) as UploadResponse
        if (response.status === 201 && data.uploads?.length === pending.length) {
          const uploads = data.uploads
          mark((_, i) => ({ status: 'done', uploadId: uploads[i]!.id }))
        } else {
          reason = data.reason ?? data.error ?? reason
          throw new Error(reason)
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : reason
        mark(() => ({ status: 'error', error: message }))
        throw e instanceof Error ? e : new Error(message)
      }
    }
    return filesRef.current.flatMap((f) => (f.status === 'done' && f.uploadId ? [f.uploadId] : []))
  }, [chatId, fetchImpl, setFiles])

  return { files, add, remove, uploadAll, reset }
}
