import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from '@/env'

export type UploadTokenPayload = {
  userId: string
  chatId: string
  id: string
  key: string
  name: string
  mediaType: string
  size: number
  exp: number
}

const sign = (body: string) => createHmac('sha256', env.BETTER_AUTH_SECRET).update(body).digest()

export function signUploadToken(payload: UploadTokenPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${sign(body).toString('base64url')}`
}

export function verifyUploadToken(token: string): UploadTokenPayload | null {
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [body, signature] = parts as [string, string]
  const expected = sign(body)
  const given = Buffer.from(signature, 'base64url')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  let payload: UploadTokenPayload
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as UploadTokenPayload
  } catch {
    return null
  }
  if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null
  return payload
}
