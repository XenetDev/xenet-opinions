import { describe, expect, it } from 'vitest'
import { deriveTestUrl, testDatabaseUrl } from './test-url'

describe('deriveTestUrl', () => {
  it('appends the name to the database name', () => {
    expect(deriveTestUrl('postgresql://xo:xo@localhost:5432/xo_test', 'engine')).toBe(
      'postgresql://xo:xo@localhost:5432/xo_test_engine',
    )
  })

  it('preserves the query string', () => {
    expect(deriveTestUrl('postgresql://xo:xo@h:5432/xo_test?sslmode=require', 'web')).toBe(
      'postgresql://xo:xo@h:5432/xo_test_web?sslmode=require',
    )
  })
})

describe('testDatabaseUrl', () => {
  it('prefers TEST_DATABASE_URL', () => {
    const env = { TEST_DATABASE_URL: 'postgresql://a:b@t:1/custom', DATABASE_URL: 'postgresql://x:y@d:2/xo' }
    expect(testDatabaseUrl('worker', env)).toBe('postgresql://a:b@t:1/custom_worker')
  })

  it('derives from DATABASE_URL with db name xo_test', () => {
    const env = { DATABASE_URL: 'postgresql://x:y@d:2/xo?sslmode=disable' }
    expect(testDatabaseUrl('db', env)).toBe('postgresql://x:y@d:2/xo_test_db?sslmode=disable')
  })

  it('resolves to undefined when neither variable is set', () => {
    expect(testDatabaseUrl('engine', {})).toBeUndefined()
  })
})
