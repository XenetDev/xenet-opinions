// @vitest-environment jsdom

import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useShortcuts } from './use-shortcuts'

afterEach(cleanup)

const press = (init: KeyboardEventInit, target: EventTarget = window) => {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event
}

const setup = () => {
  const handlers = { onSearch: vi.fn(), onNewChat: vi.fn() }
  renderHook(() => useShortcuts(handlers))
  return handlers
}

describe('useShortcuts', () => {
  it.each([{ metaKey: true }, { ctrlKey: true }])('opens search on %o+K', (mod) => {
    const { onSearch, onNewChat } = setup()
    const event = press({ key: 'k', ...mod })
    expect(onSearch).toHaveBeenCalledOnce()
    expect(onNewChat).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(true)
  })

  it('fires while a textarea has focus', () => {
    const { onSearch, onNewChat } = setup()
    const textarea = document.body.appendChild(document.createElement('textarea'))
    textarea.focus()
    expect(press({ key: 'k', metaKey: true }, textarea).defaultPrevented).toBe(true)
    expect(press({ key: 'O', metaKey: true, shiftKey: true }, textarea).defaultPrevented).toBe(true)
    expect(onSearch).toHaveBeenCalledOnce()
    expect(onNewChat).toHaveBeenCalledOnce()
    textarea.remove()
  })

  it.each([{ metaKey: true }, { ctrlKey: true }])('starts a new chat on %o+Shift+O', (mod) => {
    const { onSearch, onNewChat } = setup()
    press({ key: 'o', shiftKey: true, ...mod })
    expect(onNewChat).toHaveBeenCalledOnce()
    expect(onSearch).not.toHaveBeenCalled()
  })

  it('ignores plain keys, unshifted O and already-handled events', () => {
    const { onSearch, onNewChat } = setup()
    press({ key: 'k' })
    press({ key: 'o', metaKey: true })
    const handled = new KeyboardEvent('keydown', { key: 'k', metaKey: true, cancelable: true })
    handled.preventDefault()
    window.dispatchEvent(handled)
    expect(onSearch).not.toHaveBeenCalled()
    expect(onNewChat).not.toHaveBeenCalled()
  })

  it('ignores Alt chords and IME composition', () => {
    const { onSearch } = setup()
    press({ key: 'k', metaKey: true, altKey: true })
    press({ key: 'k', metaKey: true, isComposing: true })
    expect(onSearch).not.toHaveBeenCalled()
  })

  it('stops listening on unmount and uses the latest handlers', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender, unmount } = renderHook(({ onSearch }) => useShortcuts({ onSearch, onNewChat: vi.fn() }), {
      initialProps: { onSearch: first },
    })
    rerender({ onSearch: second })
    press({ key: 'k', metaKey: true })
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledOnce()
    unmount()
    press({ key: 'k', metaKey: true })
    expect(second).toHaveBeenCalledOnce()
  })
})
