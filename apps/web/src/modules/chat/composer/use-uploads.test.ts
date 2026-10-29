// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useUploads } from './use-uploads'

const file = (name: string) => new File(['x'], name, { type: 'text/plain' })

const formMode = (handler: (url: string, init?: RequestInit) => Response | Promise<Response>) =>
  vi.fn(async (url: string, init?: RequestInit) =>
    url === '/api/uploads/sign' ? Response.json({ mode: 'form' }) : handler(url, init),
  )
const formCall = (stub: ReturnType<typeof formMode>) =>
  stub.mock.calls.find(([url]) => url === '/api/uploads') as unknown as [string, RequestInit]

function okFetch() {
  return formMode(() =>
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
    expect(fetchStub).toHaveBeenCalledTimes(2)
    const [signUrl, signInit] = fetchStub.mock.calls[0] as unknown as [string, RequestInit]
    expect(signUrl).toBe('/api/uploads/sign')
    expect(JSON.parse(String(signInit.body))).toEqual({
      chatId: 'chat-1',
      files: [
        { name: 'a.txt', type: 'text/plain', size: 1 },
        { name: 'b.txt', type: 'text/plain', size: 1 },
      ],
    })
    const [url, init] = formCall(fetchStub)
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
    const fetchStub = formMode(() =>
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
    const body = formCall(fetchStub)[1].body as FormData
    expect(body.getAll('files')).toHaveLength(5)
  })

  it('resolves a lazy chat id at upload time', async () => {
    const fetchStub = okFetch()
    const resolve = vi.fn(async () => 'lazy-chat')
    const { result } = renderHook(() => useUploads(resolve, { fetch: fetchStub as unknown as typeof fetch }))
    act(() => result.current.add([file('a.txt'), file('b.txt')]))
    expect(resolve).not.toHaveBeenCalled()
    await act(async () => {
      await result.current.uploadAll()
    })
    const body = formCall(fetchStub)[1].body as FormData
    expect(body.get('chatId')).toBe('lazy-chat')
  })

  it('marks files error when the chat id cannot be resolved', async () => {
    const fetchStub = okFetch()
    const resolve = vi.fn(async () => {
      throw new Error('chat_failed')
    })
    const { result } = renderHook(() => useUploads(resolve, { fetch: fetchStub as unknown as typeof fetch }))
    act(() => result.current.add([file('a.txt')]))
    await act(async () => {
      await result.current.uploadAll().catch(() => {})
    })
    expect(fetchStub).not.toHaveBeenCalled()
    expect(result.current.files[0]).toMatchObject({ status: 'error', error: 'chat_failed' })
  })

  it('rejects the file that would push the total over 48 MB', () => {
    const big = (name: string, mb: number) =>
      new File([new Uint8Array(mb * 1024 * 1024)], name, { type: 'application/pdf' })
    const { result } = renderHook(() => useUploads('chat-1'))
    let accepted = -1
    act(() => {
      accepted = result.current.add([big('a.pdf', 30), big('b.pdf', 30), big('c.pdf', 10)])
    })
    expect(accepted).toBe(2)
    expect(result.current.files.map((f) => f.error ?? f.status)).toEqual(['pending', 'too_large', 'pending'])
    act(() => {
      accepted = result.current.add([big('d.pdf', 10)])
    })
    expect(accepted).toBe(0)
    expect(result.current.files[3]).toMatchObject({ status: 'error', error: 'too_large' })
  })

  it('accepts a single file larger than the old 10 MB limit', () => {
    const { result } = renderHook(() => useUploads('chat-1'))
    act(() => {
      result.current.add([new File([new Uint8Array(20 * 1024 * 1024)], 'deck.pdf', { type: 'application/pdf' })])
    })
    expect(result.current.files[0]!.status).toBe('pending')
  })

  it('returns how many files were accepted', () => {
    const { result } = renderHook(() => useUploads('chat-1'))
    let accepted = -1
    act(() => {
      accepted = result.current.add(Array.from({ length: 6 }, (_, i) => file(`f${i}.txt`)))
    })
    expect(accepted).toBe(5)
  })
})

describe('useUploads direct to bucket', () => {
  const signed = {
    mode: 'direct',
    uploads: [
      { token: 't1', url: 'https://bucket.example/a?sig=1', headers: { 'content-type': 'text/plain' } },
      { token: 't2', url: 'https://bucket.example/b?sig=2', headers: { 'content-type': 'text/plain' } },
    ],
  }
  const completed = {
    uploads: [
      { id: 'u1', filename: 'a.txt', mediaType: 'text/plain', sizeBytes: 1 },
      { id: 'u2', filename: 'b.txt', mediaType: 'text/plain', sizeBytes: 1 },
    ],
  }

  function directFetch(overrides: { put?: () => Response | Promise<Response>; complete?: () => Response } = {}) {
    return vi.fn(async (url: string, _init?: RequestInit) => {
      if (url === '/api/uploads/sign') return Response.json(signed)
      if (url === '/api/uploads/complete') return overrides.complete?.() ?? Response.json(completed, { status: 201 })
      if (url.startsWith('https://bucket.example/')) return overrides.put?.() ?? new Response(null, { status: 200 })
      throw new Error(`unexpected ${url}`)
    })
  }

  async function run(fetchStub: ReturnType<typeof directFetch>) {
    const { result } = renderHook(() => useUploads('chat-1', { fetch: fetchStub as unknown as typeof fetch }))
    act(() => result.current.add([file('a.txt'), file('b.txt')]))
    let ids: string[] = []
    let error: unknown
    await act(async () => {
      ids = await result.current.uploadAll().catch((e) => {
        error = e
        return []
      })
    })
    return { result, ids, error: error as Error | undefined }
  }

  it('puts each file to its signed URL, then completes with the tokens', async () => {
    const fetchStub = directFetch()
    const { result, ids } = await run(fetchStub)
    const puts = fetchStub.mock.calls.filter(([url]) => url.startsWith('https://'))
    expect(
      puts.map(([url, init]) => [url, init?.method, init?.headers, (init?.body as File | undefined)?.name]),
    ).toEqual([
      ['https://bucket.example/a?sig=1', 'PUT', { 'content-type': 'text/plain' }, 'a.txt'],
      ['https://bucket.example/b?sig=2', 'PUT', { 'content-type': 'text/plain' }, 'b.txt'],
    ])
    const complete = fetchStub.mock.calls.find(([url]) => url === '/api/uploads/complete')!
    expect(JSON.parse(String(complete[1]!.body))).toEqual({ chatId: 'chat-1', tokens: ['t1', 't2'] })
    expect(fetchStub.mock.calls.some(([url]) => url === '/api/uploads')).toBe(false)
    expect(ids).toEqual(['u1', 'u2'])
    expect(result.current.files.map((f) => f.status)).toEqual(['done', 'done'])
  })

  it('maps a 413 from the bucket to too_large and skips complete', async () => {
    const fetchStub = directFetch({ put: () => new Response(null, { status: 413 }) })
    const { result, error } = await run(fetchStub)
    expect(error?.message).toBe('too_large')
    expect(result.current.files.map((f) => f.error)).toEqual(['too_large', 'too_large'])
    expect(fetchStub.mock.calls.some(([url]) => url === '/api/uploads/complete')).toBe(false)
  })

  it('maps another failed or broken PUT to upload_failed', async () => {
    const forbidden = await run(directFetch({ put: () => new Response(null, { status: 403 }) }))
    expect(forbidden.error?.message).toBe('upload_failed')
    const network = await run(
      directFetch({
        put: () => {
          throw new TypeError('Failed to fetch')
        },
      }),
    )
    expect(network.error?.message).toBe('upload_failed')
    expect(network.result.current.files[0]).toMatchObject({ status: 'error', error: 'upload_failed' })
  })

  it('keeps the server reason when complete rejects', async () => {
    const fetchStub = directFetch({
      complete: () => Response.json({ error: 'upload_rejected', reason: 'missing' }, { status: 400 }),
    })
    const { error, result } = await run(fetchStub)
    expect(error?.message).toBe('missing')
    expect(result.current.files[0]).toMatchObject({ status: 'error', error: 'missing' })
  })

  it('maps a 413 from the form route to too_large', async () => {
    const fetchStub = formMode(() => new Response('Request Entity Too Large', { status: 413 }))
    const { result } = renderHook(() => useUploads('chat-1', { fetch: fetchStub as unknown as typeof fetch }))
    act(() => result.current.add([file('a.txt')]))
    await act(async () => {
      await result.current.uploadAll().catch(() => {})
    })
    expect(result.current.files[0]).toMatchObject({ status: 'error', error: 'too_large' })
  })
})
