// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { axe } from '@/test/axe'
import { SentimentBar } from './sentiment-bar'

afterEach(cleanup)

const widths = (container: HTMLElement) =>
  Object.fromEntries(
    Array.from(container.querySelectorAll<HTMLElement>('[data-segment]')).map((el) => [
      el.dataset.segment,
      Number.parseFloat(el.style.width),
    ]),
  )

describe('SentimentBar', () => {
  it('sizes segments from counts over the total', () => {
    const { container } = render(<SentimentBar split={{ positive: 3, neutral: 1, negative: 7 }} />)
    const w = widths(container)
    expect(w.positive).toBeCloseTo((3 / 11) * 100)
    expect(w.neutral).toBeCloseTo((1 / 11) * 100)
    expect(w.negative).toBeCloseTo((7 / 11) * 100)
  })

  it('describes the counts as an image', () => {
    render(<SentimentBar split={{ positive: 3, neutral: 1, negative: 7 }} />)
    expect(screen.getByRole('img', { name: 'Sentiment split: 3 positive, 1 neutral, 7 negative of 11' })).toBeTruthy()
  })

  it('skips empty segments and handles no views', () => {
    const { container } = render(<SentimentBar split={{ positive: 0, neutral: 0, negative: 0 }} />)
    expect(container.querySelectorAll('[data-segment]')).toHaveLength(0)
    expect(screen.getByRole('img', { name: 'Sentiment split: no views expressed' })).toBeTruthy()
  })

  it('shows a legend with counts and shares', async () => {
    const { container } = render(<SentimentBar split={{ positive: 1, neutral: 1, negative: 2 }} legend />)
    expect(screen.getByText('Positive 1 (25%)')).toBeTruthy()
    expect(screen.getByText('Negative 2 (50%)')).toBeTruthy()
    expect(await axe(container)).toHaveNoViolations()
  })
})
