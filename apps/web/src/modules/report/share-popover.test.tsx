// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from '@/test/axe'
import { SharePopover } from './share-popover'

const URL_ = 'https://opinions.example/r/abcdefghijklmnopqrstuvwxyz012345'
const fetchMock = vi.fn()
const writeText = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  writeText.mockReset().mockResolvedValue(undefined)
  vi.stubGlobal('fetch', fetchMock)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const ok = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))

const openAndCreate = async () => {
  fetchMock.mockReturnValueOnce(ok({ token: 't', url: URL_ }))
  render(<SharePopover chatId="c1" messageId="m1" />)
  fireEvent.click(screen.getByRole('button', { name: 'Share' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Create link' }))
  return (await screen.findByRole('textbox', { name: 'Share link' })) as HTMLInputElement
}

describe('SharePopover', () => {
  it('creates a link for this report and copies it', async () => {
    const input = await openAndCreate()
    expect(input.value).toBe(URL_)
    expect(fetchMock).toHaveBeenCalledWith('/api/chats/c1/run/share', expect.objectContaining({ method: 'POST' }))
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ messageId: 'm1' })
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Link copied.'))
    expect(writeText).toHaveBeenCalledWith(URL_)
  })

  it('revokes only after an in-place confirmation', async () => {
    const confirm = vi.spyOn(window, 'confirm')
    await openAndCreate()
    fireEvent.click(screen.getByRole('button', { name: 'Revoke link' }))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Keep link' }))
    expect(screen.getByRole('textbox', { name: 'Share link' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Revoke link' }))
    fetchMock.mockReturnValueOnce(ok({ revoked: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }))
    await screen.findByRole('button', { name: 'Create link' })
    expect(fetchMock).toHaveBeenLastCalledWith('/api/chats/c1/run/share', expect.objectContaining({ method: 'DELETE' }))
    expect(screen.queryByRole('textbox', { name: 'Share link' })).toBeNull()
    expect(screen.getByRole('status').textContent).toMatch(/revoked/)
    expect(confirm).not.toHaveBeenCalled()
  })

  it('shows a live link straight away and says what it exposes', async () => {
    const onUrlChange = vi.fn()
    render(<SharePopover chatId="c1" messageId="m1" url={URL_} onUrlChange={onUrlChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Share' }))
    const input = (await screen.findByRole('textbox', { name: 'Share link' })) as HTMLInputElement
    expect(input.value).toBe(URL_)
    expect(screen.getByText(/Anyone with the link can see your question and this report\./)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Create link' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Revoke link' }))
    fetchMock.mockReturnValueOnce(ok({ revoked: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }))
    await waitFor(() => expect(onUrlChange).toHaveBeenCalledWith(null))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reports a failed create', async () => {
    fetchMock.mockReturnValueOnce(Promise.resolve(new Response('{"error":"no_summary"}', { status: 409 })))
    render(<SharePopover chatId="c1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Share' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Create link' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/could not be created/))
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({})
  })

  it('has no axe violations with a link', async () => {
    await openAndCreate()
    expect(await axe(document.body)).toHaveNoViolations()
  })
})
