import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createHttp, MiroFishError, type MiroFishLocale } from './index'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const make = (fetch: typeof globalThis.fetch, extra: { token?: string; locale?: MiroFishLocale } = {}) =>
  createHttp({ baseUrl: 'http://mf.test', fetch, ...extra })

const caught = async (p: Promise<unknown>) => {
  try {
    await p
  } catch (e) {
    return e as MiroFishError
  }
  throw new Error('expected rejection')
}

describe('createHttp', () => {
  it('unwraps data on success', async () => {
    const http = make(async () => json({ success: true, data: { a: 1 } }))
    await expect(http.getJson('/x', z.object({ a: z.number() }))).resolves.toEqual({ a: 1 })
  })

  it('maps success:false to api error without traceback in message', async () => {
    const http = make(async () => json({ success: false, error: 'bad', traceback: 'Traceback...' }, 500))
    const err = await caught(http.getJson('/x', z.unknown()))
    expect(err).toBeInstanceOf(MiroFishError)
    expect(err.code).toBe('api')
    expect(err.message).toBe('bad')
    expect(err.traceback).toBe('Traceback...')
    expect(err.message).not.toContain('Traceback')
  })

  it('maps non-JSON body to http error with status', async () => {
    const http = make(
      async () => new Response('<html>bad gateway</html>', { status: 502, headers: { 'content-type': 'text/html' } }),
    )
    const err = await caught(http.getJson('/x', z.unknown()))
    expect(err.code).toBe('http')
    expect(err.status).toBe(502)
  })

  it('maps schema mismatch to schema error', async () => {
    const http = make(async () => json({ success: true, data: { a: 'x' } }))
    const err = await caught(http.getJson('/x', z.object({ a: z.number() })))
    expect(err.code).toBe('schema')
    expect(err.message).toMatch(/a/)
  })

  it('maps timeout to timeout error', async () => {
    const http = make(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init!.signal!
          signal.addEventListener('abort', () => reject(signal.reason))
        }),
    )
    const err = await caught(http.getJson('/x', z.unknown(), { timeoutMs: 10 }))
    expect(err.code).toBe('timeout')
  })

  const hangingFetch: typeof fetch = (_url, init) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init!.signal!
      signal.addEventListener('abort', () => reject(signal.reason))
    })

  it('maps timeout to timeout error when a caller signal is also present', async () => {
    const http = make(hangingFetch)
    const err = await caught(http.getJson('/x', z.unknown(), { timeoutMs: 10, signal: new AbortController().signal }))
    expect(err.code).toBe('timeout')
  })

  it('rethrows the caller abort reason unwrapped', async () => {
    const controller = new AbortController()
    const http = make(hangingFetch)
    const pending = http.getJson('/x', z.unknown(), { signal: controller.signal })
    controller.abort()
    const err = await pending.catch((e: unknown) => e)
    expect(err).toBe(controller.signal.reason)
    expect(err).not.toBeInstanceOf(MiroFishError)
  })

  it('postJson sends a JSON body with content-type application/json', async () => {
    let seen: RequestInit | undefined
    const http = make(async (_url, init) => {
      seen = init
      return json({ success: true, data: null })
    })
    await http.postJson('/x', { a: 1 }, z.null())
    expect(seen!.method).toBe('POST')
    expect(new Headers(seen!.headers).get('content-type')).toBe('application/json')
    expect(JSON.parse(seen!.body as string)).toEqual({ a: 1 })
  })

  it('postForm sends FormData without setting content-type', async () => {
    let seen: RequestInit | undefined
    const http = make(async (_url, init) => {
      seen = init
      return json({ success: true, data: null })
    })
    const form = new FormData()
    form.append('k', 'v')
    await http.postForm('/x', form, z.null())
    expect(seen!.method).toBe('POST')
    expect(seen!.body).toBeInstanceOf(FormData)
    expect(new Headers(seen!.headers).has('content-type')).toBe(false)
  })

  it('maps fetch rejection to network error', async () => {
    const http = make(async () => {
      throw new TypeError('fetch failed')
    })
    const err = await caught(http.getJson('/x', z.unknown()))
    expect(err.code).toBe('network')
  })

  it('sends X-MiroFish-Token when configured and omits it otherwise', async () => {
    const seen: Headers[] = []
    const stub: typeof fetch = async (_url, init) => {
      seen.push(new Headers(init?.headers))
      return json({ success: true, data: null })
    }
    await make(stub, { token: 'secret' }).getJson('/x', z.null())
    await make(stub).getJson('/x', z.null())
    expect(seen[0]!.get('X-MiroFish-Token')).toBe('secret')
    expect(seen[0]!.get('Accept')).toBe('application/json')
    expect(seen[1]!.has('X-MiroFish-Token')).toBe(false)
    expect(seen[1]!.get('Accept')).toBe('application/json')
  })

  it('sends Accept-Language en by default and the configured locale otherwise', async () => {
    const seen: Headers[] = []
    const stub: typeof fetch = async (_url, init) => {
      seen.push(new Headers(init?.headers))
      return json({ success: true, data: null })
    }
    await make(stub).getJson('/x', z.null())
    await make(stub, { locale: 'de' }).postJson('/x', {}, z.null())
    expect(seen[0]!.get('Accept-Language')).toBe('en')
    expect(seen[1]!.get('Accept-Language')).toBe('de')
  })

  it('serialises query params and drops undefined', async () => {
    let url = ''
    const http = make(async (u) => {
      url = String(u)
      return json({ success: true, data: null })
    })
    await http.getJson('/x', z.null(), { query: { a: 1, b: undefined } })
    expect(url.endsWith('/x?a=1')).toBe(true)
  })
})
