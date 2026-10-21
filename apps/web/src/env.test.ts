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
  it('rejects an unknown STORAGE_DRIVER', () => expect(() => parseEnv({ ...valid, STORAGE_DRIVER: 'ftp' })).toThrow())
  it('defaults STORAGE_DRIVER to local', () => expect(parseEnv(valid).STORAGE_DRIVER).toBe('local'))
  it('parses S3_FORCE_PATH_STYLE', () => {
    expect(parseEnv({ ...valid, S3_FORCE_PATH_STYLE: 'true' }).S3_FORCE_PATH_STYLE).toBe('true')
    expect(parseEnv({ ...valid, S3_FORCE_PATH_STYLE: '' }).S3_FORCE_PATH_STYLE).toBeUndefined()
  })
  it('defaults WORKER_POLL_MS to 2000', () => expect(parseEnv(valid).WORKER_POLL_MS).toBe(2000))
  it('requires S3_BUCKET when STORAGE_DRIVER is s3', () => expect(() => parseEnv({ ...valid, STORAGE_DRIVER: 's3' })).toThrow())
  it('accepts s3 with all required S3 vars', () =>
    expect(
      parseEnv({ ...valid, STORAGE_DRIVER: 's3', S3_BUCKET: 'b', S3_REGION: 'r', S3_ACCESS_KEY_ID: 'k', S3_SECRET_ACCESS_KEY: 's' }).STORAGE_DRIVER,
    ).toBe('s3'))
})
