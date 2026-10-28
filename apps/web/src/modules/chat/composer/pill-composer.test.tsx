// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { axe } from '@/test/axe'
import { InterviewSelectionProvider, useInterviewSelection } from '../interview-selection'
import { PillComposer } from './pill-composer'

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

type Props = ComponentProps<typeof PillComposer>

function Picker() {
  const selection = useInterviewSelection()
  return (
    <button type="button" onClick={() => selection?.toggle({ id: 'p1', name: 'Ada' })}>
      Pick Ada
    </button>
  )
}

function renderComposer(props: Partial<Props> = {}) {
  const onSend = props.onSend ?? vi.fn()
  const view = render(
    <TooltipProvider>
      <InterviewSelectionProvider enabled={props.mode === 'interview'}>
        <Picker />
        <PillComposer chatId="c1" mode="run" maxRounds={40} allowPause {...props} onSend={onSend} />
      </InterviewSelectionProvider>
    </TooltipProvider>,
  )
  return { ...view, onSend }
}

const textarea = () => screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement
const type = (value: string) => fireEvent.change(textarea(), { target: { value } })
const openMenu = (name: string | RegExp) => fireEvent.keyDown(screen.getByRole('button', { name }), { key: 'Enter' })

describe('PillComposer', () => {
  it.each([
    ['run', 'Ask how people would react to…'],
    ['followUp', 'Ask the report…'],
    ['interview', 'Ask the selected personas…'],
  ] as const)('uses the %s placeholder', (mode, placeholder) => {
    renderComposer({ mode })
    expect(textarea().placeholder).toBe(placeholder)
  })

  it('sends on Enter and keeps Shift+Enter for a new line', async () => {
    const { onSend } = renderComposer({ mode: 'followUp' })
    type('why?')
    expect(fireEvent.keyDown(textarea(), { key: 'Enter', shiftKey: true })).toBe(true)
    expect(onSend).not.toHaveBeenCalled()
    expect(fireEvent.keyDown(textarea(), { key: 'Enter' })).toBe(false)
    await waitFor(() =>
      expect(onSend).toHaveBeenCalledWith('why?', { kind: 'followUp', target: 'report', agentIds: [] }),
    )
    await waitFor(() => expect(textarea().value).toBe(''))
  })

  it('does not send while an IME composition commits with Enter', async () => {
    const { onSend } = renderComposer({ mode: 'followUp' })
    type('why?')
    fireEvent.keyDown(textarea(), { key: 'Enter', isComposing: true })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(onSend).not.toHaveBeenCalled()
  })

  it('does not send on the Safari IME commit Enter (keyCode 229)', async () => {
    const { onSend } = renderComposer({ mode: 'followUp' })
    type('why?')
    fireEvent.keyDown(textarea(), { key: 'Enter', keyCode: 229 })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(onSend).not.toHaveBeenCalled()
  })

  it('does not send on Enter while busy', async () => {
    const { onSend } = renderComposer({ mode: 'followUp', busy: true, onStop: vi.fn() })
    type('why?')
    fireEvent.keyDown(textarea(), { key: 'Enter' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(onSend).not.toHaveBeenCalled()
  })

  it('keeps Stop at full opacity while the pill is disabled', () => {
    renderComposer({ busy: true, disabled: true, onStop: vi.fn() })
    const stop = screen.getByRole('button', { name: 'Stop' })
    const pill = stop.closest('[data-slot="input-group"]') as HTMLElement
    expect(pill.className).toContain('has-disabled:opacity-100')
    expect(stop.className).not.toMatch(/(^|\s)opacity-50/)
    expect((stop as HTMLButtonElement).disabled).toBe(false)
  })

  it('does not create a chat when every attached file is rejected', async () => {
    const onNeedChat = vi.fn(async () => 'new-chat')
    renderComposer({ chatId: undefined, onNeedChat })
    const big = new File(['x'], 'huge.txt', { type: 'text/plain' })
    Object.defineProperty(big, 'size', { value: 1024 * 1024 * 1024 })
    fireEvent.change(screen.getByTestId('file-input'), { target: { files: [big] } })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.getAllByTestId('pending-file')).toHaveLength(1)
    expect(onNeedChat).not.toHaveBeenCalled()
  })

  it('states each file chip status in text', async () => {
    let release: (value: Response) => void = () => {}
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((resolve) => (release = resolve))),
    )
    renderComposer()
    fireEvent.change(screen.getByTestId('file-input'), {
      target: { files: [new File(['x'], 'brief.txt', { type: 'text/plain' })] },
    })
    expect(within(screen.getByTestId('pending-file')).getByText('Pending')).toBeTruthy()
    type('hello')
    fireEvent.keyDown(textarea(), { key: 'Enter' })
    await waitFor(() => expect(within(screen.getByTestId('pending-file')).getByText('Uploading')).toBeTruthy())
    release(Response.json({ uploads: [{ id: 'u1' }] }, { status: 201 }))
    await waitFor(() => expect(screen.queryByTestId('pending-file')).toBeNull())
  })

  it('lists attach and the pause option in the plus menu in run mode', () => {
    renderComposer()
    openMenu('Add files and options')
    const menu = screen.getByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: 'Attach files' })).toBeTruthy()
    expect(within(menu).getByRole('menuitemcheckbox', { name: 'Pause for interviews before the report' })).toBeTruthy()
  })

  it('hides the pause option when pausing is not allowed', () => {
    renderComposer({ allowPause: false })
    openMenu('Add files and options')
    expect(screen.queryByRole('menuitemcheckbox')).toBeNull()
  })

  it('keeps the menu open when ticking pause and sends the choice', async () => {
    const { onSend } = renderComposer()
    openMenu('Add files and options')
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Pause for interviews before the report' }))
    const item = screen.getByRole('menuitemcheckbox', { name: 'Pause for interviews before the report' })
    expect(item.getAttribute('aria-checked')).toBe('true')
    fireEvent.keyDown(item, { key: 'Escape' })
    type('hello')
    fireEvent.keyDown(textarea(), { key: 'Enter' })
    await waitFor(() =>
      expect(onSend).toHaveBeenCalledWith('hello', {
        kind: 'run',
        uploadIds: [],
        runOptions: { maxRounds: 3, pauseForInterviews: true },
      }),
    )
  })

  it('opens the file picker from Attach files', () => {
    renderComposer()
    const input = screen.getByTestId('file-input') as HTMLInputElement
    const click = vi.spyOn(input, 'click')
    openMenu('Add files and options')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Attach files' }))
    expect(click).toHaveBeenCalledTimes(1)
  })

  it('has no plus menu or rounds outside run mode', () => {
    renderComposer({ mode: 'followUp' })
    expect(screen.queryByRole('button', { name: 'Add files and options' })).toBeNull()
    expect(screen.queryByRole('button', { name: /rounds?$/ })).toBeNull()
  })

  it('reads the default rounds and offers 1 to maxRounds', async () => {
    const { onSend } = renderComposer({ maxRounds: 5 })
    openMenu('3 rounds')
    const items = screen.getAllByRole('menuitemradio').map((item) => item.textContent)
    expect(items).toEqual(['1 round', '2 rounds', '3 rounds', '4 rounds', '5 rounds'])
    fireEvent.click(screen.getByRole('menuitemradio', { name: '1 round' }))
    expect(screen.getByRole('button', { name: '1 round' })).toBeTruthy()
    type('hello')
    fireEvent.keyDown(textarea(), { key: 'Enter' })
    await waitFor(() =>
      expect(onSend).toHaveBeenCalledWith('hello', {
        kind: 'run',
        uploadIds: [],
        runOptions: { maxRounds: 1, pauseForInterviews: false },
      }),
    )
  })

  it('caps the default rounds at maxRounds', () => {
    renderComposer({ maxRounds: 2 })
    expect(screen.getByRole('button', { name: '2 rounds' })).toBeTruthy()
  })

  it('shows Send when idle', () => {
    renderComposer()
    expect(screen.getByRole('button', { name: 'Send message' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull()
  })

  it.each([[{ status: 'streaming' as const }], [{ status: 'submitted' as const }], [{ busy: true }]])(
    'replaces Send with an enabled Stop for %o even when disabled',
    (state) => {
      const onStop = vi.fn()
      renderComposer({ ...state, disabled: true, onStop })
      expect(screen.queryByRole('button', { name: 'Send message' })).toBeNull()
      const stop = screen.getByRole('button', { name: 'Stop' }) as HTMLButtonElement
      expect(stop.disabled).toBe(false)
      fireEvent.click(stop)
      expect(onStop).toHaveBeenCalledTimes(1)
    },
  )

  it('never sends a second message while streaming', async () => {
    const { onSend } = renderComposer({ mode: 'followUp', status: 'streaming', onStop: vi.fn() })
    type('again')
    fireEvent.keyDown(textarea(), { key: 'Enter' })
    fireEvent.submit(textarea().closest('form') as HTMLFormElement)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(onSend).not.toHaveBeenCalled()
  })

  it('disables the field, plus menu, rounds and send when disabled', () => {
    renderComposer({ disabled: true })
    expect(textarea().disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Add files and options' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: '3 rounds' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Send message' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByTestId('file-input') as HTMLInputElement).disabled).toBe(true)
  })

  it('renders a chip per pending file with a working remove button', () => {
    renderComposer()
    fireEvent.change(screen.getByTestId('file-input'), {
      target: { files: [new File(['x'], 'brief.txt', { type: 'text/plain' })] },
    })
    expect(screen.getAllByTestId('pending-file')).toHaveLength(1)
    expect(screen.getByText('brief.txt')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Remove brief.txt' }))
    expect(screen.queryByTestId('pending-file')).toBeNull()
  })

  it('renders a chip per selected persona with a working remove button', () => {
    renderComposer({ mode: 'interview' })
    fireEvent.click(screen.getByRole('button', { name: 'Pick Ada' }))
    expect(screen.getByText('Ada')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Ada' }))
    expect(screen.queryByRole('button', { name: 'Remove Ada' })).toBeNull()
  })

  it('asks for a persona before interviewing', async () => {
    const { onSend } = renderComposer({ mode: 'interview' })
    type('why?')
    fireEvent.keyDown(textarea(), { key: 'Enter' })
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Select at least one persona to interview'))
    expect(onSend).not.toHaveBeenCalled()
    expect(textarea().value).toBe('why?')
  })

  it('creates the chat on attach when there is no chat yet and uploads into it', async () => {
    const onNeedChat = vi.fn(async () => 'new-chat')
    const fetchStub = vi.fn(async (_url: string, _init: RequestInit) =>
      Response.json({ uploads: [{ id: 'u1' }] }, { status: 201 }),
    )
    vi.stubGlobal('fetch', fetchStub)
    const onSend = vi.fn()
    renderComposer({ chatId: undefined, onNeedChat, onSend })
    fireEvent.change(screen.getByTestId('file-input'), {
      target: { files: [new File(['x'], 'brief.txt', { type: 'text/plain' })] },
    })
    await waitFor(() => expect(onNeedChat).toHaveBeenCalledTimes(1))
    type('hello')
    fireEvent.keyDown(textarea(), { key: 'Enter' })
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1))
    expect(onNeedChat).toHaveBeenCalledTimes(1)
    const body = fetchStub.mock.calls[0]?.[1].body as FormData
    expect(body.get('chatId')).toBe('new-chat')
    expect(onSend.mock.calls[0]?.[1]).toMatchObject({ kind: 'run', uploadIds: ['u1'] })
  })

  it('follows a controlled value and reports edits', () => {
    const onValueChange = vi.fn()
    const { rerender } = renderComposer({ value: 'from starter', onValueChange })
    expect(textarea().value).toBe('from starter')
    type('edited')
    expect(onValueChange).toHaveBeenCalledWith('edited')
    rerender(
      <TooltipProvider>
        <InterviewSelectionProvider enabled={false}>
          <PillComposer chatId="c1" mode="run" value="next" onValueChange={onValueChange} onSend={vi.fn()} />
        </InterviewSelectionProvider>
      </TooltipProvider>,
    )
    expect(textarea().value).toBe('next')
  })

  it('shows the disclaimer', () => {
    renderComposer()
    expect(screen.getByText('Simulated opinions. Check important decisions with real people.')).toBeTruthy()
  })

  it.each(['run', 'followUp', 'interview'] as const)('has no axe violations in %s mode', async (mode) => {
    const { container } = renderComposer({ mode })
    if (mode === 'interview') fireEvent.click(screen.getByRole('button', { name: 'Pick Ada' }))
    if (mode === 'run')
      fireEvent.change(screen.getByTestId('file-input'), {
        target: { files: [new File(['x'], 'brief.txt', { type: 'text/plain' })] },
      })
    expect(await axe(container)).toHaveNoViolations()
  })
})
