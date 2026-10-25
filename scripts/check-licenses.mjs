import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export const ALLOWED = [
  'MIT',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Apache-2.0',
  '0BSD',
  'CC0-1.0',
  'Unlicense',
  'Python-2.0',
  'MPL-2.0',
  'BlueOak-1.0.0',
  'CC-BY-4.0',
]

const tokenize = (expression) => expression.replace(/[()]/g, ' $& ').trim().split(/\s+/)

const satisfies = (expression, allowed) => {
  const tokens = tokenize(expression)
  let position = 0
  const factor = () => {
    const token = tokens[position++]
    if (token === '(') {
      const value = or()
      position++
      return value
    }
    return allowed.includes(token)
  }
  const and = () => {
    let value = factor()
    while (tokens[position] === 'AND') {
      position++
      value = factor() && value
    }
    return value
  }
  const or = () => {
    let value = and()
    while (tokens[position] === 'OR') {
      position++
      value = and() || value
    }
    return value
  }
  return or() && position === tokens.length
}

export function checkLicenses(packages, allowed, exceptions) {
  const violations = packages.filter(
    ({ name, license }) => !Object.hasOwn(exceptions, name) && !(license && satisfies(license, allowed)),
  )
  return { ok: violations.length === 0, violations }
}

export function fromPnpmLicenses(json) {
  return Object.entries(json).flatMap(([key, entries]) =>
    entries.flatMap(({ name, versions, license }) =>
      versions.map((version) => ({ name, version, license: license ?? key })),
    ),
  )
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const output = execFileSync('pnpm', ['licenses', 'list', '--json', '--prod'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  const exceptions = JSON.parse(readFileSync(new URL('./license-allowlist.json', import.meta.url), 'utf8'))
  const packages = fromPnpmLicenses(JSON.parse(output))
  const { ok, violations } = checkLicenses(packages, ALLOWED, exceptions)
  for (const { name, version, license } of violations) console.error(`${name}@${version}: ${license ?? 'unknown'}`)
  console.log(ok ? `Licences OK (${packages.length} packages)` : `${violations.length} licence violation(s)`)
  process.exitCode = ok ? 0 : 1
}
