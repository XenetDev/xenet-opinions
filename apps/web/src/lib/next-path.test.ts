import { describe, expect, it } from 'vitest'
import { sanitiseNext } from './next-path'

describe('sanitiseNext', () => {
  it.each([
    [undefined, '/'],
    [null, '/'],
    ['', '/'],
    ['/', '/'],
    ['/c/abc?x=1', '/c/abc?x=1'],
    ['//evil.com', '/'],
    ['/\\evil.com', '/'],
    ['https://evil.com', '/'],
    ['javascript:alert(1)', '/'],
    ['c/abc', '/'],
    ['/\t/evil.com', '/'],
    ['/\n/evil.com', '/'],
    ['/sign-in', '/'],
    ['/sign-in?next=/c/abc', '/'],
    ['/sign-in/x', '/'],
  ])('%s -> %s', (input, expected) => {
    expect(sanitiseNext(input)).toBe(expected)
  })
})
