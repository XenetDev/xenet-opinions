import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ALLOWED, checkLicenses, fromPnpmLicenses } from './check-licenses.mjs'

const pkg = (name, license) => ({ name, version: '1.0.0', license })

describe('checkLicenses', () => {
  it('passes allowed licences', () => {
    assert.deepEqual(checkLicenses([pkg('a', 'MIT'), pkg('b', 'Apache-2.0')], ALLOWED, {}), {
      ok: true,
      violations: [],
    })
  })

  it('passes an OR expression when any alternative is allowed', () => {
    assert.deepEqual(checkLicenses([pkg('a', '(AFL-2.1 OR BSD-3-Clause)')], ALLOWED, {}), { ok: true, violations: [] })
  })

  it('fails an AND expression with one disallowed licence', () => {
    const bad = pkg('a', 'Apache-2.0 AND LGPL-3.0-or-later')
    assert.deepEqual(checkLicenses([bad, pkg('b', 'MIT AND ISC')], ALLOWED, {}), { ok: false, violations: [bad] })
  })

  it('fails unknown or missing licences', () => {
    const unknown = pkg('a', 'Unknown')
    const missing = pkg('b', undefined)
    assert.deepEqual(checkLicenses([unknown, missing], ALLOWED, {}), { ok: false, violations: [unknown, missing] })
  })

  it('skips packages listed as exceptions', () => {
    const result = checkLicenses([pkg('a', 'LGPL-3.0-or-later')], ALLOWED, { a: 'reason' })
    assert.deepEqual(result, { ok: true, violations: [] })
  })
})

describe('fromPnpmLicenses', () => {
  it('flattens the pnpm licence-keyed JSON into one entry per version', () => {
    const json = {
      MIT: [{ name: 'a', versions: ['1.0.0', '2.0.0'], license: 'MIT' }],
      Unknown: [{ name: 'b', versions: ['0.1.0'] }],
    }
    assert.deepEqual(fromPnpmLicenses(json), [
      { name: 'a', version: '1.0.0', license: 'MIT' },
      { name: 'a', version: '2.0.0', license: 'MIT' },
      { name: 'b', version: '0.1.0', license: 'Unknown' },
    ])
  })
})
