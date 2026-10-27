// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { Composer } from './composer'
import { RunOptions } from './run-options'

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

afterEach(cleanup)

const optionLabels = () => screen.getAllByRole('option').map((o) => o.textContent)

describe('RunOptions', () => {
  it('offers every round count by default', () => {
    render(<RunOptions value={{ maxRounds: 3, pauseForInterviews: false }} onChange={vi.fn()} />)
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' })
    expect(optionLabels()).toEqual(['1', '2', '3', '5', '10', '20', '40'])
  })

  it('filters options above maxRounds', () => {
    render(<RunOptions value={{ maxRounds: 3, pauseForInterviews: false }} onChange={vi.fn()} maxRounds={3} />)
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' })
    expect(optionLabels()).toEqual(['1', '2', '3'])
  })

  it('starts the composer at the capped default', () => {
    render(<Composer chatId="c1" mode="run" onSend={vi.fn()} maxRounds={2} />)
    expect(screen.getByRole('combobox').textContent).toBe('2')
  })

  it('offers the pause checkbox unticked by default', () => {
    render(<RunOptions value={{ maxRounds: 3, pauseForInterviews: false }} onChange={vi.fn()} />)
    const box = screen.getByRole('checkbox', { name: 'Pause for interviews before the report' }) as HTMLInputElement
    expect(box.checked).toBe(false)
  })

  it('hides the pause checkbox when pausing is not allowed', () => {
    render(<RunOptions value={{ maxRounds: 3, pauseForInterviews: false }} onChange={vi.fn()} allowPause={false} />)
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('sends the pause choice with the run', async () => {
    const onSend = vi.fn()
    render(<Composer chatId="c1" mode="run" onSend={onSend} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Pause for interviews before the report' }))
    fireEvent.change(screen.getByPlaceholderText('Send a message'), { target: { value: 'hello' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    await waitFor(() =>
      expect(onSend).toHaveBeenCalledWith('hello', {
        kind: 'run',
        uploadIds: [],
        runOptions: { maxRounds: 3, pauseForInterviews: true },
      }),
    )
  })

  it('never sends a pause when pausing is not allowed', async () => {
    const onSend = vi.fn()
    render(<Composer chatId="c1" mode="run" onSend={onSend} allowPause={false} />)
    expect(screen.queryByRole('checkbox')).toBeNull()
    fireEvent.change(screen.getByPlaceholderText('Send a message'), { target: { value: 'hello' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    await waitFor(() =>
      expect(onSend).toHaveBeenCalledWith('hello', {
        kind: 'run',
        uploadIds: [],
        runOptions: { maxRounds: 3, pauseForInterviews: false },
      }),
    )
  })
})
