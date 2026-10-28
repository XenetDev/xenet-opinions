import { describe, expect, it } from 'vitest'
import { deleteAccountEmail, magicLinkEmail } from '@/lib/emails'

const url = 'https://app.test/api/auth/magic-link/verify?token=abc'

describe('magicLinkEmail', () => {
  const mail = magicLinkEmail({ url })
  it('has the subject', () => expect(mail.subject).toBe('Your Xenet Opinions sign-in link'))
  it('contains the url in text and html', () => {
    expect(mail.text).toContain(url)
    expect(mail.html).toContain(url)
  })
  it('mentions the expiry and the ignore line', () => {
    expect(mail.text).toContain('15 minutes')
    expect(mail.html).toContain('15 minutes')
    expect(mail.text).toContain("If you didn't ask for this, ignore this email.")
    expect(mail.html).toContain('ignore this email')
  })
  it('has no script', () => expect(mail.html).not.toContain('<script'))
})

describe('deleteAccountEmail', () => {
  const mail = deleteAccountEmail({ url })
  it('has the subject', () => expect(mail.subject).toBe('Confirm deleting your Xenet Opinions account'))
  it('contains the url in text and html', () => {
    expect(mail.text).toContain(url)
    expect(mail.html).toContain(url)
  })
  it('mentions the ignore line', () => {
    expect(mail.text).toContain('ignore this email')
    expect(mail.html).toContain('ignore this email')
  })
  it('has no script', () => expect(mail.html).not.toContain('<script'))
})
