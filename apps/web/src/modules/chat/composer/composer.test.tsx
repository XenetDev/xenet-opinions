// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
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
    render(<Composer chatId="c1" mode="run" envOpen={false} onSend={onSend} />)
    fireEvent.change(textarea(), { target: { value: 'hello' } })
    fireEvent.click(submit())
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('hello', { kind: 'run', uploadIds: [], runOptions: { maxRounds: 3 } }))
  })

  it('does not send and keeps text when upload rejects', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'upload_rejected', reason: 'too_large' }, { status: 400 })))
    const onSend = vi.fn()
    render(<Composer chatId="c1" mode="run" envOpen={false} onSend={onSend} />)
    attach()
    fireEvent.change(textarea(), { target: { value: 'hello' } })
    fireEvent.click(submit())
    await waitFor(() => expect(screen.getByText('too_large')).toBeTruthy())
    expect(onSend).not.toHaveBeenCalled()
    expect(textarea().value).toBe('hello')
  })

  it('refuses to submit while a failed file is present', async () => {
    const fetchStub = vi.fn(async () => Response.json({ error: 'upload_rejected', reason: 'too_large' }, { status: 400 }))
    vi.stubGlobal('fetch', fetchStub)
    const onSend = vi.fn()
    render(<Composer chatId="c1" mode="run" envOpen={false} onSend={onSend} />)
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
    render(<Composer chatId="c1" mode="run" envOpen={false} onSend={vi.fn()} disabled />)
    expect(textarea().disabled).toBe(true)
    expect((screen.getByRole('button', { name: /Attach/ }) as HTMLButtonElement).disabled).toBe(true)
    expect(submit().disabled).toBe(true)
  })

  it('shows attach and rounds in run mode only', () => {
    render(<Composer chatId="c1" mode="run" envOpen={false} onSend={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Attach/ })).toBeTruthy()
    expect(screen.getByText('Rounds')).toBeTruthy()
    expect(screen.queryByRole('combobox', { name: 'Follow-up target' })).toBeNull()
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

function FollowUp(props: Partial<ComponentProps<typeof Composer>>) {
  return (
    <InterviewSelectionProvider enabled>
      <Picker />
      <Composer chatId="c1" mode="followUp" envOpen onSend={vi.fn()} {...props} />
    </InterviewSelectionProvider>
  )
}

const targetTrigger = () => screen.getByRole('combobox', { name: 'Follow-up target' })

function chooseTarget(name: string) {
  fireEvent.keyDown(targetTrigger(), { key: 'Enter' })
  fireEvent.click(screen.getByRole('option', { name }))
}

describe('Composer in follow-up mode', () => {
  it('hides attach and rounds and asks the report by default', async () => {
    const onSend = vi.fn()
    render(<FollowUp onSend={onSend} />)
    expect(screen.queryByRole('button', { name: /Attach/ })).toBeNull()
    expect(screen.queryByText('Rounds')).toBeNull()
    expect(targetTrigger().textContent).toBe('Ask the report')
    fireEvent.change(textarea(), { target: { value: 'why?' } })
    fireEvent.click(submit())
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('why?', { kind: 'followUp', target: 'report', agentIds: [] }))
  })

  it('refuses an interview with no personas selected', async () => {
    const onSend = vi.fn()
    render(<FollowUp onSend={onSend} />)
    chooseTarget('Interview personas')
    fireEvent.change(textarea(), { target: { value: 'why?' } })
    fireEvent.click(submit())
    await waitFor(() => expect(screen.getByText('Select at least one persona to interview')).toBeTruthy())
    expect(onSend).not.toHaveBeenCalled()
    expect(textarea().value).toBe('why?')
  })

  it('shows chips for selected personas, sends their ids and clears them after sending', async () => {
    const onSend = vi.fn()
    render(<FollowUp onSend={onSend} />)
    chooseTarget('Interview personas')
    fireEvent.click(screen.getByRole('button', { name: 'Pick Ada' }))
    expect(screen.getByRole('button', { name: 'Remove Ada' })).toBeTruthy()
    fireEvent.change(textarea(), { target: { value: 'why?' } })
    fireEvent.click(submit())
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('why?', { kind: 'followUp', target: 'agents', agentIds: ['p1'] }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Remove Ada' })).toBeNull())
  })

  it('removes a persona with its chip button', () => {
    render(<FollowUp />)
    chooseTarget('Interview personas')
    fireEvent.click(screen.getByRole('button', { name: 'Pick Ada' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove Ada' }))
    expect(screen.queryByRole('button', { name: 'Remove Ada' })).toBeNull()
  })

  it('disables the interview option when the env is closed', () => {
    render(<FollowUp envOpen={false} />)
    fireEvent.keyDown(targetTrigger(), { key: 'Enter' })
    expect(screen.getByRole('option', { name: 'Interview personas' }).getAttribute('aria-disabled')).toBe('true')
  })

  it('resets the target to the report when the env closes', () => {
    const view = render(<FollowUp />)
    chooseTarget('Interview personas')
    expect(targetTrigger().textContent).toBe('Interview personas')
    act(() => view.rerender(<FollowUp envOpen={false} />))
    expect(targetTrigger().textContent).toBe('Ask the report')
  })
})
