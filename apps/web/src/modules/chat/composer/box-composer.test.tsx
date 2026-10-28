// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { axe } from '@/test/axe'
import { InterviewSelectionProvider, useInterviewSelection } from '../interview-selection'
import { BoxComposer } from './box-composer'
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

type Props = ComponentProps<typeof BoxComposer>

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
        <BoxComposer chatId="c1" mode="run" maxRounds={40} allowPause {...props} onSend={onSend} />
      </InterviewSelectionProvider>
    </TooltipProvider>,
  )
  return { ...view, onSend }
}

const textarea = () => screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement
const type = (value: string) => fireEvent.change(textarea(), { target: { value } })
const openMenu = (name: string | RegExp) => fireEvent.keyDown(screen.getByRole('button', { name }), { key: 'Enter' })

describe('BoxComposer', () => {
  it('is the Composer export', () => {
    expect(Composer).toBe(BoxComposer)
  })

  it.each([
    ['run', 'Ask how people would react to…'],
    ['followUp', 'Ask the report…'],
    ['interview', 'Ask the selected personas…'],
  ] as const)('uses the %s placeholder', (mode, placeholder) => {
    renderComposer({ mode })
    expect(textarea().placeholder).toBe(placeholder)
  })

  it.each(['run', 'followUp', 'interview'] as const)('pads the field itself in %s mode', (mode) => {
    const { container } = renderComposer({ mode })
    expect(textarea().className).toMatch(/(^|\s)px-3(\s|$)/)
    expect(textarea().className).toMatch(/(^|\s)py-3(\s|$)/)
    expect(container.querySelector('[data-align="inline-start"], [data-align="inline-end"]')).toBeNull()
    expect(container.querySelector('[data-align="block-end"]')?.contains(textarea())).toBe(false)
  })

  it.each(['run', 'followUp', 'interview'] as const)(
    'lines the toolbar glyphs up with the field text in %s mode',
    (mode) => {
      const { container } = renderComposer({ mode })
      expect(container.querySelector('[data-align="block-end"]')?.className).toMatch(/(^|\s)px-1(\s|$)/)
    },
  )

  it('rings the box while the field has focus', () => {
    const { container } = renderComposer()
    const frame = container.querySelector('[data-slot="frame"]')?.className ?? ''
    expect(frame).toContain('has-[[data-slot=input-group-control]:focus-visible]:ring-3')
    expect(frame).toContain('has-[[data-slot=input-group-control]:focus-visible]:border-ring')
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

  it('offers Upload files with its hint in the plus menu', () => {
    renderComposer()
    openMenu('Add files')
    const item = within(screen.getByRole('menu')).getByRole('menuitem', { name: /Upload files/ })
    expect(within(item).getByText('Upload files')).toBeTruthy()
    expect(within(item).getByText('PDF, Markdown, text')).toBeTruthy()
  })

  it('opens the file picker from Upload files', () => {
    renderComposer()
    const input = screen.getByTestId('file-input') as HTMLInputElement
    const click = vi.spyOn(input, 'click')
    openMenu('Add files')
    fireEvent.click(screen.getByRole('menuitem', { name: /Upload files/ }))
    expect(click).toHaveBeenCalledTimes(1)
  })

  it('toggles the pause chip, swaps its icon for a check and sends the choice', async () => {
    const { onSend } = renderComposer()
    const chip = screen.getByRole('button', { name: 'Pause for interviews' })
    expect(chip.getAttribute('aria-pressed')).toBe('false')
    expect(chip.querySelector('svg.lucide-pause')).toBeTruthy()
    fireEvent.click(chip)
    expect(chip.getAttribute('aria-pressed')).toBe('true')
    expect(chip.getAttribute('data-variant')).toBe('secondary')
    expect(chip.querySelector('svg.lucide-check')).toBeTruthy()
    expect(chip.querySelector('svg.lucide-pause')).toBeNull()
    type('hello')
    fireEvent.keyDown(textarea(), { key: 'Enter' })
    await waitFor(() =>
      expect(onSend).toHaveBeenCalledWith('hello', {
        kind: 'run',
        uploadIds: [],
        runOptions: { maxRounds: 3, pauseForInterviews: true },
      }),
    )
    await waitFor(() => expect(textarea().value).toBe(''))
  })

  it('turns pause off again on a second press', () => {
    renderComposer()
    const chip = screen.getByRole('button', { name: 'Pause for interviews' })
    fireEvent.click(chip)
    fireEvent.click(chip)
    expect(chip.getAttribute('aria-pressed')).toBe('false')
    expect(chip.getAttribute('data-variant')).toBe('ghost')
  })

  it('hides the pause chip when pausing is not allowed', () => {
    renderComposer({ allowPause: false })
    expect(screen.queryByRole('button', { name: 'Pause for interviews' })).toBeNull()
  })

  it.each(['followUp', 'interview'] as const)('has no plus menu, pause or rounds in %s mode', (mode) => {
    renderComposer({ mode })
    expect(screen.queryByTestId('file-input')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add files' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Pause for interviews' })).toBeNull()
    expect(screen.queryByRole('button', { name: /rounds?$/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Send message' })).toBeTruthy()
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

  it('disables the field, plus menu, pause, rounds and send when disabled', () => {
    renderComposer({ disabled: true })
    expect(textarea().disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Add files' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Pause for interviews' }) as HTMLButtonElement).disabled).toBe(true)
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
    const chips = screen.getByTestId('pending-file').closest('[data-align="block-start"]') as HTMLElement
    expect(chips.compareDocumentPosition(textarea()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Remove brief.txt' }))
    expect(screen.queryByTestId('pending-file')).toBeNull()
  })

  it('renders a chip per selected persona with a working remove button', () => {
    renderComposer({ mode: 'interview' })
    fireEvent.click(screen.getByRole('button', { name: 'Pick Ada' }))
    expect(screen.getByText('Ada')).toBeTruthy()
    expect(screen.getByText('Ada').closest('[data-align="block-start"]')).toBeTruthy()
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
          <BoxComposer chatId="c1" mode="run" value="next" onValueChange={onValueChange} onSend={vi.fn()} />
        </InterviewSelectionProvider>
      </TooltipProvider>,
    )
    expect(textarea().value).toBe('next')
  })

  it('does not send and keeps text when upload rejects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ error: 'upload_rejected', reason: 'too_large' }, { status: 400 })),
    )
    const { onSend } = renderComposer()
    fireEvent.change(screen.getByTestId('file-input'), {
      target: { files: [new File(['x'], 'a.txt', { type: 'text/plain' })] },
    })
    type('hello')
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    await waitFor(() => expect(screen.getByText('too_large')).toBeTruthy())
    expect(onSend).not.toHaveBeenCalled()
    expect(textarea().value).toBe('hello')
  })

  it('refuses to submit while a failed file is present', async () => {
    const fetchStub = vi.fn(async () =>
      Response.json({ error: 'upload_rejected', reason: 'too_large' }, { status: 400 }),
    )
    vi.stubGlobal('fetch', fetchStub)
    const { onSend } = renderComposer()
    const submit = () => screen.getByRole('button', { name: 'Send message' }) as HTMLButtonElement
    fireEvent.change(screen.getByTestId('file-input'), {
      target: { files: [new File(['x'], 'a.txt', { type: 'text/plain' })] },
    })
    type('hello')
    fireEvent.click(submit())
    await waitFor(() => expect(screen.getByText('too_large')).toBeTruthy())
    await waitFor(() => expect(submit().disabled).toBe(false))
    fireEvent.click(submit())
    await waitFor(() => expect(screen.getByText('Remove failed files to continue')).toBeTruthy())
    expect(fetchStub).toHaveBeenCalledTimes(1)
    expect(onSend).not.toHaveBeenCalled()
    expect(textarea().value).toBe('hello')
  })

  it('leaves the file input enabled when not disabled', () => {
    renderComposer()
    expect((screen.getByTestId('file-input') as HTMLInputElement).disabled).toBe(false)
  })

  it('clears the persona notice once a persona is picked', async () => {
    renderComposer({ mode: 'interview' })
    type('why?')
    fireEvent.keyDown(textarea(), { key: 'Enter' })
    await waitFor(() => expect(screen.getByText('Select at least one persona to interview')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Pick Ada' }))
    expect(screen.queryByText('Select at least one persona to interview')).toBeNull()
  })

  it('sends the selected persona ids and clears the chips after sending', async () => {
    const { onSend } = renderComposer({ mode: 'interview' })
    fireEvent.click(screen.getByRole('button', { name: 'Pick Ada' }))
    type('why?')
    fireEvent.keyDown(textarea(), { key: 'Enter' })
    await waitFor(() =>
      expect(onSend).toHaveBeenCalledWith('why?', { kind: 'followUp', target: 'agents', agentIds: ['p1'] }),
    )
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Remove Ada' })).toBeNull())
  })

  it('keeps the chips and the text when sending fails', async () => {
    const onSend = vi.fn(async () => {
      throw new Error('window_closed')
    })
    renderComposer({ mode: 'interview', onSend })
    fireEvent.click(screen.getByRole('button', { name: 'Pick Ada' }))
    type('why?')
    fireEvent.keyDown(textarea(), { key: 'Enter' })
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1))
    await act(async () => {})
    expect(screen.getByRole('button', { name: 'Remove Ada' })).toBeTruthy()
    expect(textarea().value).toBe('why?')
  })

  it('shows no persona chips in follow-up mode', () => {
    renderComposer({ mode: 'followUp' })
    fireEvent.click(screen.getByRole('button', { name: 'Pick Ada' }))
    expect(screen.queryByRole('button', { name: 'Remove Ada' })).toBeNull()
  })

  it('shows the disclaimer', () => {
    renderComposer()
    expect(screen.getByText('Simulated opinions. Check important decisions with real people.')).toBeTruthy()
  })

  it.each(['run', 'followUp', 'interview'] as const)('has no axe violations in %s mode', async (mode) => {
    const { container } = renderComposer({ mode })
    if (mode === 'interview') fireEvent.click(screen.getByRole('button', { name: 'Pick Ada' }))
    if (mode === 'run') {
      fireEvent.change(screen.getByTestId('file-input'), {
        target: { files: [new File(['x'], 'brief.txt', { type: 'text/plain' })] },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Pause for interviews' }))
    }
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no axe violations while streaming', async () => {
    const { container } = renderComposer({ status: 'streaming', onStop: vi.fn() })
    expect(await axe(container)).toHaveNoViolations()
  })
})

describe('usage bar', () => {
  it('shows runs used, the reset time and a progress bar in run mode only', () => {
    const usage = { used: 3, max: 10, resetAt: '2026-10-29T08:00:00.000Z' }
    const { rerender } = render(
      <TooltipProvider>
        <Composer mode="run" onSend={vi.fn()} usage={usage} />
      </TooltipProvider>,
    )
    expect(screen.getByTestId('usage-bar').textContent).toContain('3 of 10 runs used today')
    expect(screen.getByTestId('usage-bar').textContent).toContain('Resets at')
    expect(screen.getByRole('progressbar', { name: 'Runs used today' })).toBeTruthy()
    rerender(
      <TooltipProvider>
        <Composer mode="followUp" onSend={vi.fn()} usage={usage} />
      </TooltipProvider>,
    )
    expect(screen.queryByTestId('usage-bar')).toBeNull()
  })

  it('says no runs are left when the quota is spent', () => {
    render(
      <TooltipProvider>
        <Composer mode="run" onSend={vi.fn()} usage={{ used: 10, max: 10, resetAt: '2026-10-29T08:00:00.000Z' }} />
      </TooltipProvider>,
    )
    expect(screen.getByTestId('usage-bar').textContent).toContain('No runs left until')
  })
})
