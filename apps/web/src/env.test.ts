import { describe, expect, it } from 'vitest'
import { parseEnv } from '@/env.schema'

const valid = {
  DATABASE_URL: 'postgresql://xo:xo@localhost:5432/xo',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:3000',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  MIROFISH_URL: 'http://localhost:5001',
  MIROFISH_TOKEN: 'token',
}

describe('parseEnv', () => {
  it('parses a valid environment', () => expect(parseEnv(valid).MIROFISH_URL).toBe('http://localhost:5001'))
  it('rejects a short BETTER_AUTH_SECRET', () => expect(() => parseEnv({ ...valid, BETTER_AUTH_SECRET: 'short' })).toThrow())
  it('rejects a missing DATABASE_URL', () => expect(() => parseEnv({ ...valid, DATABASE_URL: undefined })).toThrow())
  it('accepts missing MIROFISH_TOKEN', () => expect(parseEnv({ ...valid, MIROFISH_TOKEN: undefined }).MIROFISH_TOKEN).toBeUndefined())
})
