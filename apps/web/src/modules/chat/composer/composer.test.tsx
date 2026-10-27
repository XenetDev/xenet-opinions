// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { axe } from '@/test/axe'
import { InterviewSelectionProvider, useInterviewSelection } from '../interview-selection'
import { Composer } from './composer'

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const textarea = () => screen.getByPlaceholderText('Send a message') as HTMLTextAreaElement
const submit = () => screen.getByRole('button', { name: 'Submit' }) as HTMLButtonElement

function attach(name = 'a.txt') {
  const input = screen.getByTestId('file-input')
  fireEvent.change(input, { target: { files: [new File(['x'], name, { type: 'text/plain' })] } })
}

describe('Composer', () => {
  it('sends text with no files and default rounds', async () => {
    const onSend = vi.fn()
    render(<Composer chatId="c1" mode="run" onSend={onSend} />)
    fireEvent.change(textarea(), { target: { value: 'hello' } })
    fireEvent.click(submit())
    await waitFor(() =>
      expect(onSend).toHaveBeenCalledWith('hello', {
        kind: 'run',
        uploadIds: [],
        runOptions: { maxRounds: 3, pauseForInterviews: false },
      }),
    )
  })

  it('does not send and keeps text when upload rejects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ error: 'upload_rejected', reason: 'too_large' }, { status: 400 })),
    )
    const onSend = vi.fn()
    render(<Composer chatId="c1" mode="run" onSend={onSend} />)
    attach()
    fireEvent.change(textarea(), { target: { value: 'hello' } })
    fireEvent.click(submit())
    await waitFor(() => expect(screen.getByText('too_large')).toBeTruthy())
    expect(onSend).not.toHaveBeenCalled()
    expect(textarea().value).toBe('hello')
  })

  it('refuses to submit while a failed file is present', async () => {
    const fetchStub = vi.fn(async () =>
      Response.json({ error: 'upload_rejected', reason: 'too_large' }, { status: 400 }),
    )
    vi.stubGlobal('fetch', fetchStub)
    const onSend = vi.fn()
    render(<Composer chatId="c1" mode="run" onSend={onSend} />)
    attach()
    fireEvent.change(textarea(), { target: { value: 'hello' } })
    fireEvent.click(submit())
    await waitFor(() => expect(screen.getByText('too_large')).toBeTruthy())
    fireEvent.click(submit())
    await waitFor(() => expect(screen.getByText('Remove failed files to continue')).toBeTruthy())
    expect(fetchStub).toHaveBeenCalledTimes(1)
    expect(onSend).not.toHaveBeenCalled()
    expect(textarea().value).toBe('hello')
  })

  it('disables textarea, attach and submit when disabled', () => {
    render(<Composer chatId="c1" mode="run" onSend={vi.fn()} disabled />)
    expect(textarea().disabled).toBe(true)
    expect((screen.getByRole('button', { name: /Attach/ }) as HTMLButtonElement).disabled).toBe(true)
    expect(submit().disabled).toBe(true)
  })

  it('disables both file inputs when disabled', () => {
    const { container } = render(<Composer chatId="c1" mode="run" onSend={vi.fn()} disabled />)
    const inputs = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="file"]'))
    expect(inputs).toHaveLength(2)
    expect(inputs.every((input) => input.disabled)).toBe(true)
  })

  it('leaves both file inputs enabled when not disabled', () => {
    const { container } = render(<Composer chatId="c1" mode="run" onSend={vi.fn()} />)
    const inputs = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="file"]'))
    expect(inputs).toHaveLength(2)
    expect(inputs.some((input) => input.disabled)).toBe(false)
  })

  it('shows attach and rounds in run mode only', () => {
    render(<Composer chatId="c1" mode="run" onSend={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Attach/ })).toBeTruthy()
    expect(screen.getByText('Rounds')).toBeTruthy()
    expect(screen.queryByRole('combobox', { name: 'Follow-up target' })).toBeNull()
  })

  it('has no axe violations', async () => {
    const { container } = render(<Composer chatId="c1" mode="run" onSend={vi.fn()} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})

function Picker() {
  const selection = useInterviewSelection()
  return (
    <button type="button" onClick={() => selection?.toggle({ id: 'p1', name: 'Ada' })}>
      Pick Ada
    </button>
  )
}

function WithSelection(props: Partial<ComponentProps<typeof Composer>>) {
  return (
    <InterviewSelectionProvider enabled>
      <Picker />
      <Composer chatId="c1" mode="interview" onSend={vi.fn()} {...props} />
    </InterviewSelectionProvider>
  )
}

describe('Composer in follow-up mode', () => {
  it('hides attach, rounds and the pause and only asks the report', async () => {
    const onSend = vi.fn()
    render(<WithSelection mode="followUp" onSend={onSend} />)
    expect(screen.queryByRole('button', { name: /Attach/ })).toBeNull()
    expect(screen.queryByText('Rounds')).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.getByText('Ask the report')).toBeTruthy()
    expect(screen.queryByText('Interview personas')).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Pick Ada' }))
    expect(screen.queryByRole('button', { name: 'Remove Ada' })).toBeNull()
    fireEvent.change(textarea(), { target: { value: 'why?' } })
    fireEvent.click(submit())
    await waitFor(() =>
      expect(onSend).toHaveBeenCalledWith('why?', { kind: 'followUp', target: 'report', agentIds: [] }),
    )
  })
})

describe('Composer in interview mode', () => {
  it('fixes the target to personas with no attach, rounds or pause', () => {
    render(<WithSelection />)
    expect(screen.getByText('Interview personas')).toBeTruthy()
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByRole('button', { name: /Attach/ })).toBeNull()
    expect(screen.queryByText('Rounds')).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('refuses to send with no personas selected', async () => {
    const onSend = vi.fn()
    render(<WithSelection onSend={onSend} />)
    fireEvent.change(textarea(), { target: { value: 'why?' } })
    fireEvent.click(submit())
    await waitFor(() => expect(screen.getByText('Select at least one persona to interview')).toBeTruthy())
    expect(onSend).not.toHaveBeenCalled()
    expect(textarea().value).toBe('why?')
  })

  it('clears the persona notice once a persona is picked', async () => {
    render(<WithSelection />)
    fireEvent.change(textarea(), { target: { value: 'why?' } })
    fireEvent.click(submit())
    await waitFor(() => expect(screen.getByText('Select at least one persona to interview')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Pick Ada' }))
    expect(screen.queryByText('Select at least one persona to interview')).toBeNull()
  })

  it('shows chips for selected personas, sends their ids and clears them after sending', async () => {
    const onSend = vi.fn()
    render(<WithSelection onSend={onSend} />)
    fireEvent.click(screen.getByRole('button', { name: 'Pick Ada' }))
    expect(screen.getByRole('button', { name: 'Remove Ada' })).toBeTruthy()
    fireEvent.change(textarea(), { target: { value: 'why?' } })
    fireEvent.click(submit())
    await waitFor(() =>
      expect(onSend).toHaveBeenCalledWith('why?', { kind: 'followUp', target: 'agents', agentIds: ['p1'] }),
    )
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Remove Ada' })).toBeNull())
  })

  it('keeps the chips and the text when sending fails', async () => {
    const onSend = vi.fn(async () => {
      throw new Error('window_closed')
    })
    render(<WithSelection onSend={onSend} />)
    fireEvent.click(screen.getByRole('button', { name: 'Pick Ada' }))
    fireEvent.change(textarea(), { target: { value: 'why?' } })
    fireEvent.click(submit())
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1))
    await act(async () => {})
    expect(screen.getByRole('button', { name: 'Remove Ada' })).toBeTruthy()
    expect(textarea().value).toBe('why?')
  })

  it('removes a persona with its chip button', () => {
    render(<WithSelection />)
    fireEvent.click(screen.getByRole('button', { name: 'Pick Ada' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove Ada' }))
    expect(screen.queryByRole('button', { name: 'Remove Ada' })).toBeNull()
  })

  it('has no axe violations', async () => {
    const { container } = render(<WithSelection />)
    fireEvent.click(screen.getByRole('button', { name: 'Pick Ada' }))
    expect(await axe(container)).toHaveNoViolations()
  })
})
