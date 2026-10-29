import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/env', () => ({ env: { BETTER_AUTH_SECRET: 's'.repeat(32) } }))

import { env } from '@/env'
import { signUploadToken, verifyUploadToken } from './upload-token'

const payload = () => ({
  userId: 'user1',
  chatId: 'c1',
  id: 'up1',
  key: 'uploads/user1/up1/a.pdf',
  name: 'a.pdf',
  mediaType: 'application/pdf',
  size: 1234,
  exp: Date.now() + 60_000,
})

afterEach(() => {
  vi.useRealTimers()
  env.BETTER_AUTH_SECRET = 's'.repeat(32)
})

describe('upload tokens', () => {
  it('round-trips a signed payload', () => {
    const p = payload()
    expect(verifyUploadToken(signUploadToken(p))).toEqual(p)
  })

  it('rejects a tampered payload', () => {
    const [body, sig] = signUploadToken(payload()).split('.')
    const forged = Buffer.from(JSON.stringify({ ...payload(), size: 1 })).toString('base64url')
    expect(verifyUploadToken(`${forged}.${sig}`)).toBeNull()
    expect(verifyUploadToken(`${body}.${sig}x`)).toBeNull()
  })

  it('rejects a token signed with another secret', () => {
    const token = signUploadToken(payload())
    env.BETTER_AUTH_SECRET = 'o'.repeat(32)
    expect(verifyUploadToken(token)).toBeNull()
  })

  it('rejects an expired token', () => {
    const token = signUploadToken({ ...payload(), exp: Date.now() - 1 })
    expect(verifyUploadToken(token)).toBeNull()
  })

  it('rejects malformed input', () => {
    expect(verifyUploadToken('')).toBeNull()
    expect(verifyUploadToken('abc')).toBeNull()
    expect(verifyUploadToken('a.b.c')).toBeNull()
  })
})
