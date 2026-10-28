// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react'
import type { OpinionsUIMessage } from '@xo/engine/parts'
import { afterEach, describe, expect, it } from 'vitest'
import { axe } from '@/test/axe'
import { Thread } from './thread'

afterEach(cleanup)

const messages: OpinionsUIMessage[] = [
  { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'How will customers react?' }] },
  { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'They will grumble.' }] },
  { id: 'u2', role: 'user', parts: [{ type: 'text', text: 'Why?' }] },
]

const sources = {
  files: [
    { id: 'f1', filename: 'brief.pdf', mediaType: 'application/pdf', sizeBytes: 2048 },
    { id: 'f2', filename: 'notes.md', mediaType: 'text/markdown', sizeBytes: 512 },
  ],
}

const renderThread = (list = messages) =>
  render(
    <Thread
      messages={list}
      sources={sources}
      startedAt="2026-10-28T09:30:00.000Z"
      renderAssistant={(message) => <p>{`body of ${message.id}`}</p>}
    />,
  )

describe('Thread', () => {
  it('renders user turns as end-aligned muted bubbles', () => {
    renderThread()
    const turn = screen.getByRole('group', { name: 'You: How will customers react?' })
    expect(turn.getAttribute('data-align')).toBe('end')
    const bubble = within(turn).getByText('How will customers react?').closest('[data-slot="bubble"]')
    expect(bubble?.getAttribute('data-variant')).toBe('muted')
    expect(bubble?.getAttribute('data-align')).toBe('end')
  })

  it('shows attachment chips from sources on the first user turn only', () => {
    renderThread()
    const first = screen.getByRole('group', { name: 'You: How will customers react?' })
    expect(within(first).getByText('brief.pdf')).toBeTruthy()
    expect(within(first).getByText('notes.md')).toBeTruthy()
    const second = screen.getByRole('group', { name: 'You: Why?' })
    expect(within(second).queryByText('brief.pdf')).toBeNull()
  })

  it('renders assistant turns with the product header and the rendered body in a ghost bubble', () => {
    renderThread()
    const turn = screen.getByRole('group', { name: 'Xenet Opinions' })
    expect(within(turn).getByText('Xenet Opinions')).toBeTruthy()
    const body = within(turn).getByText('body of a1')
    expect(body.closest('[data-slot="bubble"]')?.getAttribute('data-variant')).toBe('ghost')
  })

  it('opens with a date separator', () => {
    const { container } = renderThread()
    const marker = container.querySelector('[data-slot="marker"][data-variant="separator"]')
    expect(marker?.textContent).toBe(new Date('2026-10-28T09:30:00.000Z').toLocaleDateString())
  })

  it('does not animate the history on first render', () => {
    const { container } = renderThread()
    const items = container.querySelectorAll('[data-slot="message-scroller-item"][data-message-id]')
    expect(items).toHaveLength(3)
    for (const item of items) expect(item.className).not.toContain('animate-in')
  })

  it('animates a turn that arrives after mount, unless motion is reduced', () => {
    const view = renderThread()
    const arriving: OpinionsUIMessage = { id: 'a2', role: 'assistant', parts: [{ type: 'text', text: 'Because.' }] }
    view.rerender(
      <Thread
        messages={[...messages, arriving]}
        sources={sources}
        startedAt="2026-10-28T09:30:00.000Z"
        renderAssistant={(message) => <p>{`body of ${message.id}`}</p>}
      />,
    )
    const item = view.container.querySelector('[data-message-id="a2"]') as HTMLElement
    expect(item.className).toContain('animate-in')
    expect(item.className).toContain('motion-reduce:animate-none')
    expect(view.container.querySelector('[data-message-id="u1"]')?.className).not.toContain('animate-in')
    const header = within(item).getByText('Xenet Opinions').closest('[data-slot="message-header"]')
    expect(header?.textContent).toMatch(/^Xenet Opinions·\d{1,2}:\d{2}/)
  })

  it('has a scroll-to-end button', () => {
    const { container } = renderThread()
    expect(container.querySelector('[data-slot="message-scroller-button"]')).not.toBeNull()
    expect(screen.getByText('Scroll to end')).toBeTruthy()
  })

  it('has no axe violations with one user and one assistant turn', async () => {
    const { container } = renderThread(messages.slice(0, 2))
    expect(await axe(container)).toHaveNoViolations()
  })
})
