// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { RunOptions } from './run-options'
import { Composer } from './composer'

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

afterEach(cleanup)

const optionLabels = () => screen.getAllByRole('option').map((o) => o.textContent)

describe('RunOptions', () => {
  it('offers every round count by default', () => {
    render(<RunOptions value={{ maxRounds: 3 }} onChange={vi.fn()} />)
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' })
    expect(optionLabels()).toEqual(['1', '2', '3', '5', '10', '20', '40'])
  })

  it('filters options above maxRounds', () => {
    render(<RunOptions value={{ maxRounds: 3 }} onChange={vi.fn()} maxRounds={3} />)
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' })
    expect(optionLabels()).toEqual(['1', '2', '3'])
  })

  it('starts the composer at the capped default', () => {
    render(<Composer chatId="c1" mode="run" envOpen={false} onSend={vi.fn()} maxRounds={2} />)
    expect(screen.getByRole('combobox').textContent).toBe('2')
  })
})
