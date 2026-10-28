import type { Mail } from '@/lib/mailer'

type Body = Pick<Mail, 'subject' | 'text' | 'html'>

const IGNORE = "If you didn't ask for this, ignore this email."

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function card(input: { heading: string; intro: string; button: string; url: string }): string {
  const url = escapeHtml(input.url)
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f4f5;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#18181b"><table role="presentation" width="100%"><tr><td align="center"><table role="presentation" width="480" style="max-width:480px;background:#ffffff;border-radius:12px;padding:32px"><tr><td align="center"><h1 style="margin:0 0 12px;font-size:20px">${escapeHtml(input.heading)}</h1><p style="margin:0 0 24px;font-size:15px;line-height:22px">${escapeHtml(input.intro)}</p><a href="${url}" style="display:inline-block;padding:12px 24px;background:#18181b;color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px">${escapeHtml(input.button)}</a><p style="margin:24px 0 8px;font-size:13px;color:#52525b">Or paste this link into your browser:</p><p style="margin:0 0 24px;font-size:13px;word-break:break-all"><a href="${url}" style="color:#52525b">${url}</a></p><p style="margin:0;font-size:13px;color:#71717a">${escapeHtml(IGNORE)}</p></td></tr></table></td></tr></table></body></html>`
}

export function magicLinkEmail({ url }: { url: string }): Body {
  const intro = 'Use the button below to sign in to Xenet Opinions. The link expires in 15 minutes.'
  return {
    subject: 'Your Xenet Opinions sign-in link',
    text: `${intro}\n\n${url}\n\n${IGNORE}`,
    html: card({ heading: 'Sign in to Xenet Opinions', intro, button: 'Sign in', url }),
  }
}

export function deleteAccountEmail({ url }: { url: string }): Body {
  const intro = 'Use the button below to permanently delete your Xenet Opinions account and its data.'
  return {
    subject: 'Confirm deleting your Xenet Opinions account',
    text: `${intro}\n\n${url}\n\n${IGNORE}`,
    html: card({ heading: 'Delete your account', intro, button: 'Delete my account', url }),
  }
}
