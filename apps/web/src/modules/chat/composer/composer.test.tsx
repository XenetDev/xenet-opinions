// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Composer } from './composer'

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
    render(<Composer chatId="c1" onSend={onSend} />)
    fireEvent.change(textarea(), { target: { value: 'hello' } })
    fireEvent.click(submit())
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('hello', [], { maxRounds: 3 }))
  })

  it('does not send and keeps text when upload rejects', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'upload_rejected', reason: 'too_large' }, { status: 400 })))
    const onSend = vi.fn()
    render(<Composer chatId="c1" onSend={onSend} />)
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
    render(<Composer chatId="c1" onSend={onSend} />)
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
    render(<Composer chatId="c1" onSend={vi.fn()} disabled />)
    expect(textarea().disabled).toBe(true)
    expect((screen.getByRole('button', { name: /Attach/ }) as HTMLButtonElement).disabled).toBe(true)
    expect(submit().disabled).toBe(true)
  })
})
