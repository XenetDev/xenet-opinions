// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useUploads } from './use-uploads'

const file = (name: string) => new File(['x'], name, { type: 'text/plain' })

function okFetch() {
  return vi.fn(async () =>
    Response.json(
      {
        uploads: [
          { id: 'u1', filename: 'a.txt', mediaType: 'text/plain', sizeBytes: 1 },
          { id: 'u2', filename: 'b.txt', mediaType: 'text/plain', sizeBytes: 1 },
        ],
      },
      { status: 201 },
    ),
  )
}

describe('useUploads', () => {
  it('posts one multipart request with all files and returns ids', async () => {
    const fetchStub = okFetch()
    const { result } = renderHook(() => useUploads('chat-1', { fetch: fetchStub as unknown as typeof fetch }))
    act(() => result.current.add([file('a.txt'), file('b.txt')]))
    let ids: string[] = []
    await act(async () => {
      ids = await result.current.uploadAll()
    })
    expect(fetchStub).toHaveBeenCalledTimes(1)
    const [url, init] = fetchStub.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/uploads')
    const body = init.body as FormData
    expect(body.get('chatId')).toBe('chat-1')
    expect(body.getAll('files')).toHaveLength(2)
    expect(ids).toEqual(['u1', 'u2'])
    expect(result.current.files.map((f) => f.status)).toEqual(['done', 'done'])
  })

  it('marks files error and rejects with the server reason on failure', async () => {
    const fetchStub = vi.fn(async () =>
      Response.json({ error: 'upload_rejected', reason: 'too_large' }, { status: 400 }),
    )
    const { result } = renderHook(() => useUploads('chat-1', { fetch: fetchStub as unknown as typeof fetch }))
    act(() => result.current.add([file('a.txt')]))
    let error: unknown
    await act(async () => {
      await result.current.uploadAll().catch((e) => {
        error = e
      })
    })
    expect((error as Error).message).toContain('too_large')
    expect(result.current.files[0]!.status).toBe('error')
  })

  it('rejects a sixth file locally and does not send it', async () => {
    const fetchStub = vi.fn(async () =>
      Response.json(
        {
          uploads: Array.from({ length: 5 }, (_, i) => ({
            id: `u${i}`,
            filename: 'f',
            mediaType: 'text/plain',
            sizeBytes: 1,
          })),
        },
        { status: 201 },
      ),
    )
    const { result } = renderHook(() => useUploads('chat-1', { fetch: fetchStub as unknown as typeof fetch }))
    act(() => result.current.add(Array.from({ length: 5 }, (_, i) => file(`f${i}.txt`))))
    act(() => result.current.add([file('extra.txt')]))
    expect(result.current.files[5]).toMatchObject({ status: 'error', error: 'too_many' })
    await act(async () => {
      await result.current.uploadAll()
    })
    const body = (fetchStub.mock.calls[0] as unknown as [string, RequestInit])[1].body as FormData
    expect(body.getAll('files')).toHaveLength(5)
  })
})
