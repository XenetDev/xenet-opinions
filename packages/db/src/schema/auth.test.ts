import { getTableColumns, getTableName } from 'drizzle-orm'
import { getTableConfig } from 'drizzle-orm/pg-core'
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

it('keys rate_limit uniquely and stores last_request as bigint', () => {
  const { indexes, columns } = getTableConfig(schema.rateLimit)
  expect(indexes.map((i) => [i.config.name, i.config.unique])).toEqual([['rate_limit_key_idx', true]])
  expect(columns.find((c) => c.name === 'last_request')?.getSQLType()).toBe('bigint')
})
