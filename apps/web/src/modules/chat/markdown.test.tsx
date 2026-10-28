// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Markdown } from './markdown'

afterEach(cleanup)

describe('Markdown', () => {
  it('scales headings down one step below sm', () => {
    const { container } = render(<Markdown>{'# Title\n\nBody'}</Markdown>)
    const root = container.firstElementChild as HTMLElement
    for (const name of [
      '[&_h1]:text-xl',
      'sm:[&_h1]:text-2xl',
      '[&_h2]:text-lg',
      'sm:[&_h2]:text-xl',
      '[&_h3]:text-base',
      'sm:[&_h3]:text-lg',
    ])
      expect(root.classList.contains(name)).toBe(true)
    expect(root.classList.contains('size-full')).toBe(true)
  })
})
