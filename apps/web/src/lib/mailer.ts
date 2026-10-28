import { env } from '@/env'

export type Mail = { to: string; subject: string; text: string; html: string }
export type Mailer = { kind: 'resend' | 'console'; send(mail: Mail): Promise<void> }

export class MailerError extends Error {
  constructor(
    readonly code: 'send_failed' | 'console_mailer_in_production',
    message?: string,
  ) {
    super(message ?? code)
    this.name = 'MailerError'
  }
}

export function createMailer(
  source: { RESEND_API_KEY?: string; EMAIL_FROM?: string },
  nodeEnv: string | undefined,
  fetchImpl: typeof fetch = fetch,
  log: (line: string) => void = console.log,
): Mailer {
  const { RESEND_API_KEY: apiKey, EMAIL_FROM: from } = source
  if (apiKey) {
    return {
      kind: 'resend',
      async send(mail) {
        const res = await fetchImpl('https://api.resend.com/emails', {
          method: 'POST',
          headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
        })
        if (!res.ok) throw new MailerError('send_failed', `Resend responded ${res.status}`)
      },
    }
  }
  return {
    kind: 'console',
    async send(mail) {
      if (nodeEnv === 'production') throw new MailerError('console_mailer_in_production')
      log(`[mailer] to=${mail.to} subject=${mail.subject}`)
      log(mail.text)
    },
  }
}

let cached: Mailer | undefined

export function getMailer(): Mailer {
  cached ??= createMailer(env, process.env.NODE_ENV)
  return cached
}
