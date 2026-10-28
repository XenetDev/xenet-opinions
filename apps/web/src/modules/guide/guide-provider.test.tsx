// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const nav = vi.hoisted(() => ({ pathname: '/' }))

vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }))
vi.mock('./scenes/ask', () => ({ AskScene: () => <div>ask</div> }))
vi.mock('./scenes/watch', () => ({ WatchScene: () => <div>watch</div> }))
vi.mock('./scenes/interview', () => ({ InterviewScene: () => <div>interview</div> }))
vi.mock('./scenes/report', () => ({ ReportScene: () => <div>report</div> }))

import { GuideProvider, hasSeenGuide, markGuideSeen, useGuide } from './guide-provider'

let open: () => void = () => {}
const Grab = () => {
  open = useGuide().open
  return null
}

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

beforeEach(() => {
  nav.pathname = '/'
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  open = () => {}
  vi.restoreAllMocks()
  document.body.innerHTML = ''
  window.history.replaceState(null, '', '/')
})

const renderProvider = () =>
  render(
    <GuideProvider>
      <Grab />
    </GuideProvider>,
  )

const tick = () => act(() => new Promise((resolve) => setTimeout(resolve, 50)))
const guide = () => screen.queryByRole('dialog', { name: 'How Xenet Opinions works' })
const seen = () => localStorage.getItem('xo.guide.v1')

describe('GuideProvider', () => {
  it('opens on the home page for a first-time visitor', async () => {
    renderProvider()
    await waitFor(() => expect(guide()).toBeTruthy())
    expect(seen()).toBeNull()
  })

  it('stays closed once seen', async () => {
    localStorage.setItem('xo.guide.v1', 'seen')
    renderProvider()
    await tick()
    expect(guide()).toBeNull()
  })

  it('stays closed on a thread page', async () => {
    nav.pathname = '/c/x'
    renderProvider()
    await tick()
    expect(guide()).toBeNull()
  })

  it('stays closed while another dialog is open', async () => {
    const other = document.createElement('div')
    other.setAttribute('role', 'dialog')
    document.body.append(other)
    renderProvider()
    await tick()
    expect(guide()).toBeNull()
  })

  it('stays closed when a sign-in link is opening the sign-in dialog', async () => {
    window.history.replaceState(null, '', '/?signIn=1')
    renderProvider()
    await tick()
    expect(guide()).toBeNull()
  })

  it('reopens on step one with the first step focused after closing on the last', async () => {
    renderProvider()
    await waitFor(() => expect(guide()).toBeTruthy())
    fireEvent.click(screen.getByRole('tab', { name: 'Read the report, keep asking' }))
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(guide()).toBeNull())
    act(() => open())
    expect(screen.getByRole('heading', { name: 'Ask a question' })).toBeTruthy()
    const first = screen.getByRole('tab', { name: 'Ask a question' })
    expect(first.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(first)
  })

  it('marks the guide seen on Done', async () => {
    renderProvider()
    await waitFor(() => expect(guide()).toBeTruthy())
    fireEvent.click(screen.getByRole('tab', { name: 'Read the report, keep asking' }))
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(guide()).toBeNull())
    expect(seen()).toBe('seen')
  })

  it('marks the guide seen on Escape', async () => {
    renderProvider()
    await waitFor(() => expect(guide()).toBeTruthy())
    fireEvent.keyDown(guide() as HTMLElement, { key: 'Escape' })
    await waitFor(() => expect(guide()).toBeNull())
    expect(seen()).toBe('seen')
  })

  it('marks the guide seen on an overlay click', async () => {
    renderProvider()
    await waitFor(() => expect(guide()).toBeTruthy())
    await tick()
    const overlay = document.querySelector('[data-slot="dialog-overlay"]') as HTMLElement
    fireEvent.pointerDown(overlay, { button: 0 })
    fireEvent.pointerUp(overlay, { button: 0 })
    fireEvent.click(overlay)
    await waitFor(() => expect(guide()).toBeNull())
    expect(seen()).toBe('seen')
  })

  it('marks the guide seen from the close button', async () => {
    renderProvider()
    await waitFor(() => expect(guide()).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(guide()).toBeNull())
    expect(seen()).toBe('seen')
  })

  it('opens from useGuide() on any page, at the first step', async () => {
    nav.pathname = '/c/x'
    localStorage.setItem('xo.guide.v1', 'seen')
    renderProvider()
    act(() => open())
    expect(guide()).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.keyDown(guide() as HTMLElement, { key: 'Escape' })
    await waitFor(() => expect(guide()).toBeNull())
    act(() => open())
    expect(screen.getByRole('heading', { name: 'Ask a question' })).toBeTruthy()
  })

  it('is a no-op outside a provider', () => {
    render(<Grab />)
    expect(() => open()).not.toThrow()
    expect(guide()).toBeNull()
  })

  it('survives a storage that throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(hasSeenGuide()).toBe(false)
    expect(() => markGuideSeen()).not.toThrow()
  })
})
