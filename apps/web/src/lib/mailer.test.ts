import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMailer, MailerError } from '@/lib/mailer'

vi.mock('@/env', () => ({ env: {} }))

const mail = { to: 'a@b.co', subject: 'Hello', text: 'plain body', html: '<p>html</p>' }
const resendSource = { RESEND_API_KEY: 're_key', EMAIL_FROM: 'Xenet <hi@xenet.ai>' }

describe('resend mailer', () => {
  it('posts the mail to the Resend API', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }))
    const mailer = createMailer(resendSource, 'production', fetchImpl as unknown as typeof fetch)
    await mailer.send(mail)
    expect(mailer.kind).toBe('resend')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.resend.com/emails')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ authorization: 'Bearer re_key', 'content-type': 'application/json' })
    expect(JSON.parse(init.body as string)).toEqual({
      from: 'Xenet <hi@xenet.ai>',
      to: ['a@b.co'],
      subject: 'Hello',
      text: 'plain body',
      html: '<p>html</p>',
    })
  })

  it('rejects with send_failed on a non-2xx response without leaking the body', async () => {
    const fetchImpl = vi.fn(async () => new Response('secret-detail', { status: 422 }))
    const mailer = createMailer(resendSource, 'production', fetchImpl as unknown as typeof fetch)
    const error = await mailer.send(mail).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(MailerError)
    expect((error as MailerError).code).toBe('send_failed')
    expect((error as MailerError).message).not.toContain('secret-detail')
  })
})

describe('resend mailer timeout', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('aborts the Resend request after 10 seconds', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }))
    await createMailer(resendSource, 'production', fetchImpl as unknown as typeof fetch).send(mail)
    expect(timeout).toHaveBeenCalledWith(10_000)
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.signal).toBe(timeout.mock.results[0]?.value)
  })

  it('rejects when the request times out', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new DOMException('The operation timed out.', 'TimeoutError')
    })
    const mailer = createMailer(resendSource, 'production', fetchImpl as unknown as typeof fetch)
    await expect(mailer.send(mail)).rejects.toMatchObject({ name: 'TimeoutError' })
  })
})

describe('console mailer', () => {
  it('logs the recipient, subject and text without calling fetch', async () => {
    const fetchImpl = vi.fn()
    const log = vi.fn()
    const mailer = createMailer({}, 'development', fetchImpl as unknown as typeof fetch, log)
    await mailer.send(mail)
    expect(mailer.kind).toBe('console')
    expect(fetchImpl).not.toHaveBeenCalled()
    const output = log.mock.calls.map((c) => String(c[0])).join('\n')
    expect(output).toContain('[mailer] to=a@b.co subject=Hello')
    expect(output).toContain('plain body')
  })

  it('rejects in production', async () => {
    const mailer = createMailer({}, 'production', vi.fn() as unknown as typeof fetch, vi.fn())
    await expect(mailer.send(mail)).rejects.toMatchObject({ code: 'console_mailer_in_production' })
  })
})
