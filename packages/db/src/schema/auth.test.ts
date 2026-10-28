import { getTableColumns, getTableName } from 'drizzle-orm'
import { expect, it } from 'vitest'
import * as schema from './index'

it('defines the rate_limit table for Better Auth', () => {
  expect(getTableName(schema.rateLimit)).toBe('rate_limit')
  expect(Object.values(getTableColumns(schema.rateLimit)).map((c) => c.name)).toEqual([
    'id',
    'key',
    'count',
    'last_request',
  ])
})
