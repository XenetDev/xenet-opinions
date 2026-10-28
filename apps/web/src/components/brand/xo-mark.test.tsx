// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { XoMark } from './xo-mark'

afterEach(cleanup)

describe('XoMark', () => {
  it('renders a decorative svg', () => {
    const { container } = render(<XoMark className="w-6" />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
    expect(svg?.getAttribute('viewBox')).toBe('0 0 300 138')
    expect(svg?.getAttribute('class')).toBe('w-6')
  })

  it('is centred in the favicon tile', () => {
    const icon = readFileSync(resolve(__dirname, '../../app/icon.svg'), 'utf8')
    const [, x, y, scale] = /translate\(([\d.]+) ([\d.]+)\) scale\(([\d.]+)\)/.exec(icon) ?? []
    expect(Number(x) * 2 + 300 * Number(scale)).toBeCloseTo(64)
    expect(Number(y) * 2 + 138 * Number(scale)).toBeCloseTo(64)
  })
})
