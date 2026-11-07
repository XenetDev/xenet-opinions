// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { type ComponentProps, useState } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { axe } from '@/test/axe'
import { InterviewSelectionProvider, useInterviewSelection } from '../interview-selection'
import { BoxComposer } from './box-composer'
import { Composer } from './composer'

const toastSpy = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast: toastSpy }))

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

afterEach(() => {
  toastSpy.mockReset()
  cleanup()
  window.localStorage.clear()
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

function Controlled({ onValueChange, onSend }: Pick<Props, 'onSend'> & { onValueChange: (value: string) => void }) {
  const [value, setValue] = useState('hello')
  return (
    <BoxComposer
      chatId="c1"
      mode="run"
      value={value}
      onValueChange={(next) => {
        onValueChange(next)
        setValue(next)
      }}
      onSend={onSend}
    />
  )
}

const textarea = () => screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement
const type = (value: string) => fireEvent.change(textarea(), { target: { value } })
const formUpload = <T extends unknown[]>(post: (...args: T) => Promise<Response>) =>
  vi.fn(async (...args: T) => (args[0] === '/api/uploads/sign' ? Response.json({ mode: 'form' }) : post(...args)))
const stubUpload = () =>
  vi.stubGlobal(
    'fetch',
    formUpload(async () => Response.json({ uploads: [{ id: 'u1' }] }, { status: 201 })),
  )
const attach = () =>
  fireEvent.change(screen.getByTestId('file-input'), {
    target: { files: [new File(['x'], 'brief.txt', { type: 'text/plain' })] },
  })
const DEFAULT_PANEL = { participants: 20, groups: [], webResearch: false }
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
      formUpload(() => new Promise<Response>((resolve) => (release = resolve))),
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

  it('keeps the toolbar to attach, Improve prompt and send', () => {
    const { container } = renderComposer()
    const toolbar = container.querySelector('[data-align="block-end"]') as HTMLElement
    expect(
      within(toolbar)
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label') ?? b.textContent),
    ).toEqual(['Add files', 'Improve prompt', 'Send message'])
    expect(screen.queryByRole('button', { name: 'Pause for interviews' })).toBeNull()
    expect(screen.queryByRole('button', { name: /rounds?$/ })).toBeNull()
  })

  it('sends pause and rounds chosen in Configure', async () => {
    stubUpload()
    const { onSend } = renderComposer({ maxRounds: 5 })
    attach()
    fireEvent.click(screen.getByRole('button', { name: /Configure/ }))
    fireEvent.click(screen.getByRole('switch', { name: 'Pause for interviews' }))
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Rounds' }), { key: 'Enter' })
    expect(screen.getAllByRole('option').map((item) => item.textContent)).toEqual([
      '1 round',
      '2 rounds',
      '3 rounds',
      '4 rounds',
      '5 rounds',
    ])
    fireEvent.click(screen.getByRole('option', { name: '1 round' }))
    expect(screen.getByTestId('panel-summary').textContent).toBe('about 20 participants · 1 round · pause on · ~3 min')
    type('hello')
    fireEvent.keyDown(textarea(), { key: 'Enter' })
    await waitFor(() =>
      expect(onSend).toHaveBeenCalledWith('hello', {
        kind: 'run',
        uploadIds: ['u1'],
        files: [{ id: 'u1', filename: 'brief.txt', mediaType: 'text/plain', sizeBytes: 1 }],
        runOptions: { maxRounds: 1, pauseForInterviews: true },
        panel: DEFAULT_PANEL,
      }),
    )
  })

  it('offers no pause in Configure when pausing is not allowed', () => {
    renderComposer({ allowPause: false })
    fireEvent.click(screen.getByRole('button', { name: /Configure/ }))
    expect(screen.queryByRole('switch', { name: 'Pause for interviews' })).toBeNull()
  })

  it.each(['followUp', 'interview'] as const)('has no plus menu, pause or rounds in %s mode', (mode) => {
    renderComposer({ mode })
    expect(screen.queryByTestId('file-input')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add files' })).toBeNull()
    expect(screen.queryByRole('switch', { name: 'Pause for interviews' })).toBeNull()
    expect(screen.queryByRole('combobox', { name: 'Rounds' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Send message' })).toBeTruthy()
  })

  it('caps the default rounds at maxRounds', () => {
    renderComposer({ maxRounds: 2 })
    expect(screen.getByTestId('panel-summary').textContent).toContain('· 2 rounds ·')
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

  it('disables the field, plus menu, Configure and send when disabled', () => {
    renderComposer({ disabled: true })
    expect(textarea().disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Add files' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: /Configure/ }) as HTMLButtonElement).disabled).toBe(true)
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

  it('sends a run without a document', async () => {
    const { onSend } = renderComposer()
    type('hello')
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    await waitFor(() =>
      expect(onSend).toHaveBeenCalledWith('hello', expect.objectContaining({ kind: 'run', uploadIds: [] })),
    )
    expect(screen.queryByRole('status')).toBeNull()
    await waitFor(() => expect(textarea().value).toBe(''))
  })

  it('acknowledges a send at once: spinner, disabled send and a read-only field until it settles', async () => {
    stubUpload()
    const onSend = vi.fn(() => new Promise<void>(() => {}))
    renderComposer({ onSend })
    attach()
    type('hello')
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1))
    const send = screen.getByRole('button', { name: 'Send message' }) as HTMLButtonElement
    expect(send.disabled).toBe(true)
    expect(send.getAttribute('aria-busy')).toBe('true')
    expect(send.querySelector('[data-slot="spinner"]')).toBeTruthy()
    expect(textarea().readOnly).toBe(true)
    expect(textarea().value).toBe('')
  })

  it.each(['run', 'followUp', 'interview'] as const)(
    'clears the text as soon as a %s message is sent, before it settles',
    async (mode) => {
      const onSend = vi.fn(() => new Promise<void>(() => {}))
      renderComposer({ mode, onSend })
      if (mode === 'interview') fireEvent.click(screen.getByRole('button', { name: 'Pick Ada' }))
      type('hello')
      fireEvent.keyDown(textarea(), { key: 'Enter' })
      await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1))
      expect(textarea().value).toBe('')
    },
  )

  it.each(['run', 'interview'] as const)('puts the text back when a %s send fails', async (mode) => {
    const onSend = vi.fn(async () => {
      throw new Error('send_failed')
    })
    renderComposer({ mode, onSend })
    if (mode === 'interview') fireEvent.click(screen.getByRole('button', { name: 'Pick Ada' }))
    type('hello')
    fireEvent.keyDown(textarea(), { key: 'Enter' })
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(textarea().value).toBe('hello'))
    expect(textarea().readOnly).toBe(false)
  })

  it('puts a controlled value back through onValueChange when the send fails', async () => {
    const onValueChange = vi.fn()
    const onSend = vi.fn(async () => {
      throw new Error('send_failed')
    })
    render(
      <TooltipProvider>
        <Controlled onValueChange={onValueChange} onSend={onSend} />
      </TooltipProvider>,
    )
    fireEvent.keyDown(textarea(), { key: 'Enter' })
    await waitFor(() => expect(textarea().value).toBe('hello'))
    expect(onValueChange.mock.calls).toEqual([[''], ['hello']])
  })

  it('closes Configure when a run is sent', async () => {
    const onSend = vi.fn(() => new Promise<void>(() => {}))
    renderComposer({ onSend })
    fireEvent.click(screen.getByRole('button', { name: /Configure/ }))
    expect(screen.getByRole('slider')).toBeTruthy()
    type('hello')
    fireEvent.keyDown(textarea(), { key: 'Enter' })
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('slider')).toBeNull()
    expect(screen.getByRole('button', { name: /Configure/ }).getAttribute('aria-expanded')).toBe('false')
  })

  it('creates the chat on attach when there is no chat yet and uploads into it', async () => {
    const onNeedChat = vi.fn(async () => 'new-chat')
    const fetchStub = formUpload(async (_url: string, _init: RequestInit) =>
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
    const body = fetchStub.mock.calls.find(([url]) => url === '/api/uploads')?.[1].body as FormData
    expect(body.get('chatId')).toBe('new-chat')
    expect(onSend.mock.calls[0]?.[1]).toMatchObject({
      kind: 'run',
      uploadIds: ['u1'],
      files: [{ id: 'u1', filename: 'brief.txt', mediaType: 'text/plain', sizeBytes: 1 }],
    })
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
    await waitFor(() =>
      expect(screen.getByText('Files must be 50 MB or smaller, and 48 MB in total per run')).toBeTruthy(),
    )
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
    await waitFor(() =>
      expect(screen.getByText('Files must be 50 MB or smaller, and 48 MB in total per run')).toBeTruthy(),
    )
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
      fireEvent.click(screen.getByRole('button', { name: /Configure/ }))
      fireEvent.click(screen.getByRole('switch', { name: 'Pause for interviews' }))
    }
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no axe violations while streaming', async () => {
    const { container } = renderComposer({ status: 'streaming', onStop: vi.fn() })
    expect(await axe(container)).toHaveNoViolations()
  })

  it('shows a lip on the composer only when given one', () => {
    renderComposer()
    expect(screen.queryByTestId('composer-lip')).toBeNull()
    cleanup()
    renderComposer({ lip: <span>No runs left</span> })
    expect(screen.getByTestId('composer-lip').textContent).toBe('No runs left')
  })

  it('blocks a new run when out of runs: disabled send, tooltip text and a toast on Enter', async () => {
    const onSend = vi.fn()
    const onClick = vi.fn()
    renderComposer({
      onSend,
      blocked: { message: "You've used your free run.", action: { label: 'Sign in', onClick } },
    })
    type('hello')
    const sendButton = screen.getByRole('button', { name: 'Send message' })
    expect(sendButton.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(sendButton)
    fireEvent.keyDown(textarea(), { key: 'Enter' })
    await waitFor(() => expect(toastSpy).toHaveBeenCalledTimes(2))
    expect(toastSpy).toHaveBeenCalledWith("You've used your free run.", { action: { label: 'Sign in', onClick } })
    expect(onSend).not.toHaveBeenCalled()
    expect(textarea().value).toBe('hello')
  })

  it('does not block follow-ups when out of runs', async () => {
    const onSend = vi.fn()
    renderComposer({ mode: 'followUp', onSend, blocked: { message: 'none left' } })
    type('why?')
    fireEvent.keyDown(textarea(), { key: 'Enter' })
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1))
    expect(toastSpy).not.toHaveBeenCalled()
  })

  describe('configure panel', () => {
    const configure = () => fireEvent.click(screen.getByRole('button', { name: /Configure/ }))

    it('shows above the box in run mode only', () => {
      renderComposer({ maxParticipants: 25, maxRounds: 5 })
      expect(screen.getByTestId('panel-summary').textContent).toBe('about 20 participants · 3 rounds · ~5 min')
      cleanup()
      renderComposer({ mode: 'followUp' })
      expect(screen.queryByRole('button', { name: /Configure/ })).toBeNull()
    })

    it('sends the chosen panel with the run', async () => {
      const { onSend } = renderComposer({ maxParticipants: 25, webResearchAvailable: true, plan: 'starter' })
      configure()
      fireEvent.click(screen.getByRole('button', { name: 'Customers' }))
      fireEvent.change(screen.getByRole('textbox', { name: 'Audience' }), { target: { value: 'Fleet managers' } })
      type('hello')
      fireEvent.keyDown(textarea(), { key: 'Enter' })
      await waitFor(() =>
        expect(onSend).toHaveBeenCalledWith(
          'hello',
          expect.objectContaining({
            panel: { participants: 20, groups: ['customers'], audience: 'Fleet managers', webResearch: true },
          }),
        ),
      )
    })

    it('sends web research off when it is unavailable, whatever was stored', async () => {
      window.localStorage.setItem('xo.panel', JSON.stringify({ participants: 40, groups: [], webResearch: true }))
      const { onSend } = renderComposer({ maxParticipants: 10, webResearchAvailable: false })
      type('hello')
      fireEvent.keyDown(textarea(), { key: 'Enter' })
      await waitFor(() =>
        expect(onSend).toHaveBeenCalledWith(
          'hello',
          expect.objectContaining({ panel: { participants: 10, groups: [], webResearch: false } }),
        ),
      )
    })
  })

  describe('Improve prompt', () => {
    const improve = () => screen.getByRole('button', { name: 'Improve prompt' })
    const answer = (response: () => Response) => {
      const fetchStub = vi.fn(async () => response())
      vi.stubGlobal('fetch', fetchStub)
      return fetchStub
    }

    it('is disabled without text and absent outside run mode', () => {
      renderComposer()
      expect((improve() as HTMLButtonElement).disabled).toBe(true)
      cleanup()
      renderComposer({ mode: 'followUp' })
      expect(screen.queryByRole('button', { name: 'Improve prompt' })).toBeNull()
    })

    it('replaces the text with the brief and undoes it with one click', async () => {
      const fetchStub = answer(() => Response.json({ text: 'Should we raise prices? Owners and dealers.' }))
      renderComposer()
      type('raise prices?')
      fireEvent.click(improve())
      await waitFor(() => expect(textarea().value).toBe('Should we raise prices? Owners and dealers.'))
      const [url, init] = fetchStub.mock.calls[0] as unknown as [string, RequestInit]
      expect(url).toBe('/api/prompt/improve')
      expect(init.method).toBe('POST')
      expect(JSON.parse(String(init.body))).toEqual({ text: 'raise prices?' })
      fireEvent.click(screen.getByRole('button', { name: 'Undo improve' }))
      expect(textarea().value).toBe('raise prices?')
      expect(screen.queryByRole('button', { name: 'Undo improve' })).toBeNull()
    })

    it('clears an improved prompt on send and drops the undo', async () => {
      answer(() => Response.json({ text: 'A brief.' }))
      const onSend = vi.fn(() => new Promise<void>(() => {}))
      renderComposer({ onSend })
      type('q')
      fireEvent.click(improve())
      await screen.findByRole('button', { name: 'Undo improve' })
      fireEvent.keyDown(textarea(), { key: 'Enter' })
      await waitFor(() => expect(onSend).toHaveBeenCalledWith('A brief.', expect.objectContaining({ kind: 'run' })))
      expect(textarea().value).toBe('')
      expect(screen.queryByRole('button', { name: 'Undo improve' })).toBeNull()
      expect(screen.getByRole('button', { name: 'Improve prompt' })).toBeTruthy()
    })

    it('reports the improved text through a controlled value', async () => {
      answer(() => Response.json({ text: 'A brief.' }))
      const onValueChange = vi.fn()
      renderComposer({ value: 'q', onValueChange })
      fireEvent.click(improve())
      await waitFor(() => expect(onValueChange).toHaveBeenCalledWith('A brief.'))
    })

    it('drops the undo once the user edits the text', async () => {
      answer(() => Response.json({ text: 'A brief.' }))
      renderComposer()
      type('q')
      fireEvent.click(improve())
      await screen.findByRole('button', { name: 'Undo improve' })
      type('A brief, edited.')
      expect(screen.queryByRole('button', { name: 'Undo improve' })).toBeNull()
    })

    const pendingImprove = () => {
      let resolve: (response: Response) => void = () => {}
      vi.stubGlobal(
        'fetch',
        vi.fn(
          () =>
            new Promise<Response>((done) => {
              resolve = done
            }),
        ),
      )
      return (text: string) => act(async () => resolve(Response.json({ text })))
    }

    it('sends nothing while the rewrite is in flight', async () => {
      const finish = pendingImprove()
      const { onSend } = renderComposer()
      type('raise prices?')
      fireEvent.click(improve())
      fireEvent.keyDown(textarea(), { key: 'Enter' })
      expect((screen.getByRole('button', { name: 'Send message' }) as HTMLButtonElement).disabled).toBe(true)
      fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
      await finish('A brief.')
      expect(onSend).not.toHaveBeenCalled()
      expect(textarea().value).toBe('A brief.')
    })

    it('ignores a late rewrite once the text has changed', async () => {
      const finish = pendingImprove()
      renderComposer()
      type('raise prices?')
      fireEvent.click(improve())
      type('something else')
      await finish('A brief.')
      expect(textarea().value).toBe('something else')
      expect(screen.queryByRole('button', { name: 'Undo improve' })).toBeNull()
      expect(toastSpy).not.toHaveBeenCalled()
    })

    it('keeps the original and says so when the rewrite fails', async () => {
      answer(() => Response.json({ error: 'improve_failed' }, { status: 502 }))
      renderComposer()
      type('raise prices?')
      fireEvent.click(improve())
      await waitFor(() => expect(toastSpy).toHaveBeenCalledWith("Couldn't improve the prompt. Your text is unchanged."))
      expect(textarea().value).toBe('raise prices?')
      expect(screen.queryByRole('button', { name: 'Undo improve' })).toBeNull()
    })
  })
})
