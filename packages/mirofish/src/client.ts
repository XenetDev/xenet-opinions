import type { z } from 'zod'
import { MiroFishError } from './errors'
import { englishMessage } from './messages'
import { Envelope } from './schemas/common'

export const MIROFISH_LOCALES = ['en', 'zh', 'es', 'fr', 'pt', 'ru', 'de'] as const
export type MiroFishLocale = (typeof MIROFISH_LOCALES)[number]

export type MiroFishClientOptions = {
  baseUrl: string
  token?: string
  locale?: MiroFishLocale
  fetch?: typeof fetch
  defaultTimeoutMs?: number
}

export type RequestInitOptions = {
  timeoutMs?: number
  signal?: AbortSignal
  query?: Record<string, string | number | undefined>
}

export type Http = {
  getJson<T>(path: string, schema: z.ZodType<T>, init?: RequestInitOptions): Promise<T>
  postJson<T>(path: string, body: unknown, schema: z.ZodType<T>, init?: RequestInitOptions): Promise<T>
  postForm<T>(path: string, form: FormData, schema: z.ZodType<T>, init?: RequestInitOptions): Promise<T>
}

const DEFAULT_TIMEOUT_MS = 30_000

const buildUrl = (baseUrl: string, path: string, query?: RequestInitOptions['query']) => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) params.set(key, String(value))
  }
  const qs = params.toString()
  return `${baseUrl.replace(/\/+$/, '')}${path}${qs ? `?${qs}` : ''}`
}

export const createHttp = (opts: MiroFishClientOptions): Http => {
  const doFetch = opts.fetch ?? fetch
  const defaultTimeoutMs = opts.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS

  const request = async <T>(
    method: 'GET' | 'POST',
    path: string,
    schema: z.ZodType<T>,
    init: RequestInitOptions | undefined,
    payload?: { body: BodyInit; contentType?: string },
  ): Promise<T> => {
    const headers: Record<string, string> = { Accept: 'application/json', 'Accept-Language': opts.locale ?? 'en' }
    if (opts.token) headers['X-MiroFish-Token'] = opts.token
    if (payload?.contentType) headers['Content-Type'] = payload.contentType

    const timeoutSignal = AbortSignal.timeout(init?.timeoutMs ?? defaultTimeoutMs)
    const signal = init?.signal ? AbortSignal.any([timeoutSignal, init.signal]) : timeoutSignal

    let res: Response
    let text: string
    try {
      res = await doFetch(buildUrl(opts.baseUrl, path, init?.query), {
        method,
        headers,
        body: payload?.body,
        signal,
      })
      text = await res.text()
    } catch (cause) {
      if ((signal.reason as { name?: string } | undefined)?.name === 'TimeoutError') {
        throw new MiroFishError({ code: 'timeout', message: `MiroFish request timed out: ${path}`, path, cause })
      }
      if (signal.aborted) throw signal.reason
      const message = cause instanceof Error ? cause.message : 'network error'
      throw new MiroFishError({ code: 'network', message, path, cause })
    }

    let json: unknown
    try {
      json = JSON.parse(text)
    } catch (cause) {
      throw new MiroFishError({
        code: 'http',
        message: `MiroFish returned a non-JSON response (HTTP ${res.status})`,
        path,
        status: res.status,
        cause,
      })
    }

    const envelope = Envelope.safeParse(json)
    if (!envelope.success) {
      throw new MiroFishError({
        code: 'http',
        message: `MiroFish returned an unexpected response (HTTP ${res.status})`,
        path,
        status: res.status,
      })
    }

    if (!envelope.data.success) {
      throw new MiroFishError({
        code: 'api',
        message: envelope.data.error ? englishMessage(envelope.data.error) : 'MiroFish request failed',
        path,
        status: res.status,
        traceback: envelope.data.traceback,
        raw: envelope.data.error,
      })
    }

    if (!res.ok) {
      throw new MiroFishError({
        code: 'http',
        message: `MiroFish request failed (HTTP ${res.status})`,
        path,
        status: res.status,
      })
    }

    const parsed = schema.safeParse(envelope.data.data)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      const where = issue?.path.join('.') || '(root)'
      throw new MiroFishError({
        code: 'schema',
        message: `Invalid MiroFish response at ${where}: ${issue?.message ?? 'validation failed'}`,
        path,
        status: res.status,
        cause: parsed.error,
      })
    }
    return parsed.data
  }

  return {
    getJson: (path, schema, init) => request('GET', path, schema, init),
    postJson: (path, body, schema, init) =>
      request('POST', path, schema, init, { body: JSON.stringify(body), contentType: 'application/json' }),
    postForm: (path, form, schema, init) => request('POST', path, schema, init, { body: form }),
  }
}
