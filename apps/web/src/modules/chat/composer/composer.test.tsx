// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps, ReactNode } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
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

const wrap = (node: ReactNode) => render(<TooltipProvider>{node}</TooltipProvider>)
const textarea = () => screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement
const submit = () => screen.getByRole('button', { name: 'Send message' }) as HTMLButtonElement

function attach(name = 'a.txt') {
  const input = screen.getByTestId('file-input')
  fireEvent.change(input, { target: { files: [new File(['x'], name, { type: 'text/plain' })] } })
}

describe('Composer', () => {
  it('sends text with no files and default rounds', async () => {
    const onSend = vi.fn()
    wrap(<Composer chatId="c1" mode="run" onSend={onSend} />)
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
    wrap(<Composer chatId="c1" mode="run" onSend={onSend} />)
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
    wrap(<Composer chatId="c1" mode="run" onSend={onSend} />)
    attach()
    fireEvent.change(textarea(), { target: { value: 'hello' } })
    fireEvent.click(submit())
    await waitFor(() => expect(screen.getByText('too_large')).toBeTruthy())
    await waitFor(() => expect(submit().disabled).toBe(false))
    fireEvent.click(submit())
    await waitFor(() => expect(screen.getByText('Remove failed files to continue')).toBeTruthy())
    expect(fetchStub).toHaveBeenCalledTimes(1)
    expect(onSend).not.toHaveBeenCalled()
    expect(textarea().value).toBe('hello')
  })

  it('clears the text and files after a run is sent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ uploads: [{ id: 'u1' }] }, { status: 201 })),
    )
    const onSend = vi.fn()
    wrap(<Composer chatId="c1" mode="run" onSend={onSend} />)
    attach()
    fireEvent.change(textarea(), { target: { value: 'hello' } })
    fireEvent.click(submit())
    await waitFor(() => expect(onSend.mock.calls[0]?.[1]).toMatchObject({ uploadIds: ['u1'] }))
    await waitFor(() => expect(screen.queryByTestId('pending-file')).toBeNull())
    expect(textarea().value).toBe('')
  })

  it('starts from the initial text', () => {
    wrap(<Composer chatId="c1" mode="run" onSend={vi.fn()} initialText="draft" />)
    expect(textarea().value).toBe('draft')
  })

  it('leaves the file input enabled when not disabled', () => {
    wrap(<Composer chatId="c1" mode="run" onSend={vi.fn()} />)
    expect((screen.getByTestId('file-input') as HTMLInputElement).disabled).toBe(false)
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
    <TooltipProvider>
      <InterviewSelectionProvider enabled>
        <Picker />
        <Composer chatId="c1" mode="interview" onSend={vi.fn()} {...props} />
      </InterviewSelectionProvider>
    </TooltipProvider>
  )
}

describe('Composer in follow-up mode', () => {
  it('asks the report with no attach, rounds or persona chips', async () => {
    const onSend = vi.fn()
    render(<WithSelection mode="followUp" onSend={onSend} />)
    expect(screen.queryByTestId('file-input')).toBeNull()
    expect(screen.queryByRole('button', { name: /rounds?$/ })).toBeNull()
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
  it('has no attach, rounds or pause', () => {
    render(<WithSelection />)
    expect(screen.queryByTestId('file-input')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add files and options' })).toBeNull()
    expect(screen.queryByRole('button', { name: /rounds?$/ })).toBeNull()
  })

  it('clears the persona notice once a persona is picked', async () => {
    render(<WithSelection />)
    fireEvent.change(textarea(), { target: { value: 'why?' } })
    fireEvent.click(submit())
    await waitFor(() => expect(screen.getByText('Select at least one persona to interview')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Pick Ada' }))
    expect(screen.queryByText('Select at least one persona to interview')).toBeNull()
  })

  it('sends the selected persona ids and clears the chips after sending', async () => {
    const onSend = vi.fn()
    render(<WithSelection onSend={onSend} />)
    fireEvent.click(screen.getByRole('button', { name: 'Pick Ada' }))
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
})
