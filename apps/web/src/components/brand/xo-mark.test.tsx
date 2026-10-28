// @vitest-environment jsdom

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
})
