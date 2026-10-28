import { describe, expect, it } from 'vitest'
import { envSchema, parseEnv } from '@/env.schema'

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
  it('rejects a short BETTER_AUTH_SECRET', () =>
    expect(() => parseEnv({ ...valid, BETTER_AUTH_SECRET: 'short' })).toThrow())
  it('rejects a missing DATABASE_URL', () => expect(() => parseEnv({ ...valid, DATABASE_URL: undefined })).toThrow())
  it('accepts missing MIROFISH_TOKEN', () =>
    expect(parseEnv({ ...valid, MIROFISH_TOKEN: undefined }).MIROFISH_TOKEN).toBeUndefined())

  it('defaults MIROFISH_LOCALE to en, accepts a supported locale and rejects others', () => {
    expect(parseEnv(valid).MIROFISH_LOCALE).toBe('en')
    expect(parseEnv({ ...valid, MIROFISH_LOCALE: '' }).MIROFISH_LOCALE).toBe('en')
    expect(parseEnv({ ...valid, MIROFISH_LOCALE: 'de' }).MIROFISH_LOCALE).toBe('de')
    expect(() => parseEnv({ ...valid, MIROFISH_LOCALE: 'jp' })).toThrow()
  })
  it('rejects an unknown STORAGE_DRIVER', () => expect(() => parseEnv({ ...valid, STORAGE_DRIVER: 'ftp' })).toThrow())
  it('defaults STORAGE_DRIVER to local', () => expect(parseEnv(valid).STORAGE_DRIVER).toBe('local'))
  it('parses S3_FORCE_PATH_STYLE', () => {
    expect(parseEnv({ ...valid, S3_FORCE_PATH_STYLE: 'true' }).S3_FORCE_PATH_STYLE).toBe('true')
    expect(parseEnv({ ...valid, S3_FORCE_PATH_STYLE: '' }).S3_FORCE_PATH_STYLE).toBeUndefined()
  })
  it('defaults WORKER_POLL_MS to 2000', () => expect(parseEnv(valid).WORKER_POLL_MS).toBe(2000))
  it('defaults the demo limits', () => {
    const env = parseEnv(valid)
    expect([env.DEMO_MODE, env.DEMO_PAUSED, env.MAX_RUNS_PER_DAY, env.DEMO_MAX_ROUNDS]).toEqual(['0', '0', 3, 3])
  })
  it('defaults DEMO_ALLOW_PAUSE to 1 and rejects other values', () => {
    expect(parseEnv(valid).DEMO_ALLOW_PAUSE).toBe('1')
    expect(parseEnv({ ...valid, DEMO_ALLOW_PAUSE: '0' }).DEMO_ALLOW_PAUSE).toBe('0')
    expect(() => parseEnv({ ...valid, DEMO_ALLOW_PAUSE: 'yes' })).toThrow()
  })
  it('defaults HEALTH_CHECK_MIROFISH to 1 and rejects other values', () => {
    expect(parseEnv(valid).HEALTH_CHECK_MIROFISH).toBe('1')
    expect(parseEnv({ ...valid, HEALTH_CHECK_MIROFISH: '0' }).HEALTH_CHECK_MIROFISH).toBe('0')
    expect(() => parseEnv({ ...valid, HEALTH_CHECK_MIROFISH: 'yes' })).toThrow()
  })
  it('rejects DEMO_MAX_ROUNDS outside 1..40', () => {
    expect(() => parseEnv({ ...valid, DEMO_MAX_ROUNDS: '0' })).toThrow()
    expect(() => parseEnv({ ...valid, DEMO_MAX_ROUNDS: '41' })).toThrow()
  })
  it('requires S3_BUCKET when STORAGE_DRIVER is s3', () =>
    expect(() => parseEnv({ ...valid, STORAGE_DRIVER: 's3' })).toThrow())
  it('accepts s3 with all required S3 vars', () =>
    expect(
      parseEnv({
        ...valid,
        STORAGE_DRIVER: 's3',
        S3_BUCKET: 'b',
        S3_REGION: 'r',
        S3_ACCESS_KEY_ID: 'k',
        S3_SECRET_ACCESS_KEY: 's',
      }).STORAGE_DRIVER,
    ).toBe('s3'))
  it('accepts no provider variables', () => expect(() => parseEnv(valid)).not.toThrow())
  it('rejects GOOGLE_CLIENT_ID without secret', () => {
    const result = envSchema.safeParse({ ...valid, GOOGLE_CLIENT_ID: 'id' })
    expect(result.error?.issues.map((i) => i.path)).toEqual([['GOOGLE_CLIENT_SECRET']])
  })
  it('rejects RESEND_API_KEY without EMAIL_FROM', () => {
    const result = envSchema.safeParse({ ...valid, RESEND_API_KEY: 're_1' })
    expect(result.error?.issues.map((i) => i.path)).toEqual([['EMAIL_FROM']])
  })
  it('rejects a malformed EMAIL_FROM', () =>
    expect(() => parseEnv({ ...valid, EMAIL_FROM: 'not an address' })).toThrow())
  it('accepts "Name <a@b.co>" and bare addresses', () => {
    expect(parseEnv({ ...valid, EMAIL_FROM: 'Name <a@b.co>' }).EMAIL_FROM).toBe('Name <a@b.co>')
    expect(parseEnv({ ...valid, EMAIL_FROM: 'a@b.co' }).EMAIL_FROM).toBe('a@b.co')
  })
  it('defaults MAX_RUNS_PER_DAY_ANONYMOUS to 1 and MAX_RUNS_PER_DAY to 3', () => {
    const env = parseEnv(valid)
    expect([env.MAX_RUNS_PER_DAY_ANONYMOUS, env.MAX_RUNS_PER_DAY]).toEqual([1, 3])
  })
})
