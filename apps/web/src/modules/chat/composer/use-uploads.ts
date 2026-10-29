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
type SignResponse = {
  mode?: 'form' | 'direct'
  uploads?: Array<{ token: string; url: string; headers: Record<string, string> }>
  reason?: string
  error?: string
}

const readJson = async <T>(response: Response) => (await response.json().catch(() => ({}))) as T
const failure = (response: Response, data: { reason?: string; error?: string }) =>
  response.status === 413 ? 'too_large' : (data.reason ?? data.error ?? 'upload_failed')
const jsonInit = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

export function useUploads(chatId: string | (() => Promise<string>), deps: { fetch?: typeof fetch } = {}) {
  const [files, setFilesState] = useState<PendingFile[]>([])
  const filesRef = useRef<PendingFile[]>([])
  const fetchImpl = deps.fetch

  const setFiles = useCallback((update: (prev: PendingFile[]) => PendingFile[]) => {
    filesRef.current = update(filesRef.current)
    setFilesState(filesRef.current)
  }, [])

  const add = useCallback(
    (incoming: File[]) => {
      let acceptedCount = 0
      setFiles((prev) => {
        const kept = prev.filter((f) => f.status !== 'error').map((f) => f.file)
        const added = incoming.map((file): PendingFile => {
          const localId = crypto.randomUUID()
          const result =
            kept.length >= MAX_FILES ? ({ ok: false, reason: 'too_many' } as const) : validateUploads([...kept, file])
          if (!result.ok) return { localId, file, status: 'error', error: result.reason }
          kept.push(file)
          acceptedCount += 1
          return { localId, file, status: 'pending' }
        })
        return [...prev, ...added]
      })
      return acceptedCount
    },
    [setFiles],
  )

  const remove = useCallback(
    (localId: string) => setFiles((prev) => prev.filter((f) => f.localId !== localId)),
    [setFiles],
  )

  const reset = useCallback(() => setFiles(() => []), [setFiles])

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
      try {
        const request = fetchImpl ?? fetch
        const id = typeof chatId === 'string' ? chatId : await chatId()
        const manifest = pending.map(({ file }) => ({ name: file.name, type: file.type, size: file.size }))
        const signResponse = await request('/api/uploads/sign', jsonInit({ chatId: id, files: manifest }))
        const signed = await readJson<SignResponse>(signResponse)
        if (!signResponse.ok) throw new Error(failure(signResponse, signed))
        let response: Response
        if (signed.mode === 'direct' && signed.uploads?.length === pending.length) {
          const targets = signed.uploads
          const puts = await Promise.all(
            targets.map(({ url, headers }, i) =>
              request(url, { method: 'PUT', headers, body: pending[i]!.file }).catch(() => null),
            ),
          )
          const failed = puts.find((put) => !put?.ok)
          if (failed !== undefined) throw new Error(failed?.status === 413 ? 'too_large' : 'upload_failed')
          response = await request(
            '/api/uploads/complete',
            jsonInit({ chatId: id, tokens: targets.map((t) => t.token) }),
          )
        } else if (signed.mode === 'form') {
          const form = new FormData()
          form.append('chatId', id)
          for (const { file } of pending) form.append('files', file)
          response = await request('/api/uploads', { method: 'POST', body: form })
        } else {
          throw new Error('upload_failed')
        }
        const data = await readJson<UploadResponse>(response)
        if (response.status === 201 && data.uploads?.length === pending.length) {
          const uploads = data.uploads
          mark((_, i) => ({ status: 'done', uploadId: uploads[i]!.id }))
        } else {
          throw new Error(failure(response, data))
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : 'upload_failed'
        mark(() => ({ status: 'error', error: message }))
        throw e instanceof Error ? e : new Error(message)
      }
    }
    return filesRef.current.flatMap((f) => (f.status === 'done' && f.uploadId ? [f.uploadId] : []))
  }, [chatId, fetchImpl, setFiles])

  return { files, add, remove, uploadAll, reset }
}
