// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { axe } from '@/test/axe'

vi.mock('./scenes/ask', () => ({
  AskScene: ({ active }: { active: boolean }) => <div data-testid="scene">ask {String(active)}</div>,
}))
vi.mock('./scenes/watch', () => ({
  WatchScene: ({ active }: { active: boolean }) => <div data-testid="scene">watch {String(active)}</div>,
}))
vi.mock('./scenes/interview', () => ({
  InterviewScene: ({ active }: { active: boolean }) => <div data-testid="scene">interview {String(active)}</div>,
}))
vi.mock('./scenes/report', () => ({
  ReportScene: ({ active }: { active: boolean }) => <div data-testid="scene">report {String(active)}</div>,
}))

import { GuideDialog } from './guide-dialog'

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

afterEach(cleanup)

const dialog = () => screen.getByRole('dialog', { name: 'How Xenet Opinions works' })
const heading = () => within(dialog()).getByRole('heading', { level: 2, name: /^(?!How Xenet)/ }).textContent
const scene = () => screen.getByTestId('scene').textContent

describe('GuideDialog', () => {
  it('shows four steps and pages with Next, Back and Done', () => {
    const onOpenChange = vi.fn()
    render(<GuideDialog open onOpenChange={onOpenChange} />)
    expect(within(dialog()).getAllByRole('tab')).toHaveLength(4)
    expect(heading()).toBe('Ask a question')
    expect(
      within(dialog()).getByText(
        'Describe a decision and who it affects. Attach documents for the best results, or just ask.',
      ),
    ).toBeTruthy()
    expect(scene()).toBe('ask true')
    expect(screen.getAllByTestId('scene')).toHaveLength(1)
    expect((screen.getByRole('button', { name: 'Back' }) as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(heading()).toBe('Watch the simulation unfold')
    expect(scene()).toBe('watch true')
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(heading()).toBe('Ask a question')

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(heading()).toBe('Interview the personas')
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(heading()).toBe('Read the report, keep asking')
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('changes step with the arrow keys and clamps at the ends', () => {
    render(<GuideDialog open onOpenChange={() => {}} />)
    fireEvent.keyDown(dialog(), { key: 'ArrowLeft' })
    expect(heading()).toBe('Ask a question')
    fireEvent.keyDown(screen.getByRole('button', { name: 'Next' }), { key: 'ArrowRight' })
    expect(heading()).toBe('Watch the simulation unfold')
    fireEvent.keyDown(dialog(), { key: 'ArrowRight' })
    fireEvent.keyDown(dialog(), { key: 'ArrowRight' })
    fireEvent.keyDown(dialog(), { key: 'ArrowRight' })
    expect(heading()).toBe('Read the report, keep asking')
    fireEvent.keyDown(dialog(), { key: 'ArrowLeft' })
    expect(heading()).toBe('Interview the personas')
  })

  it('ignores arrow keys with modifiers or inside editable fields', () => {
    render(<GuideDialog open onOpenChange={() => {}} />)
    fireEvent.keyDown(dialog(), { key: 'ArrowRight', altKey: true })
    fireEvent.keyDown(dialog(), { key: 'ArrowRight', ctrlKey: true })
    fireEvent.keyDown(dialog(), { key: 'ArrowRight', metaKey: true })
    expect(heading()).toBe('Ask a question')
    const input = document.createElement('input')
    const textarea = document.createElement('textarea')
    const editable = document.createElement('div')
    editable.setAttribute('contenteditable', 'true')
    dialog().append(input, textarea, editable)
    for (const field of [input, textarea, editable]) fireEvent.keyDown(field, { key: 'ArrowRight' })
    expect(heading()).toBe('Ask a question')
  })

  it('moves focus with the step when arrowing on the stepper', () => {
    render(<GuideDialog open onOpenChange={() => {}} />)
    const first = screen.getByRole('tab', { name: 'Ask a question' })
    first.focus()
    fireEvent.keyDown(first, { key: 'ArrowRight' })
    const second = screen.getByRole('tab', { name: 'Watch the simulation unfold' })
    expect(second.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(second)
  })

  it('jumps to a step from the stepper', () => {
    render(<GuideDialog open onOpenChange={() => {}} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Interview the personas' }))
    expect(heading()).toBe('Interview the personas')
    expect(scene()).toBe('interview true')
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe(
      screen.getByRole('tab', { name: 'Interview the personas' }).id,
    )
  })

  it('has no axe violations', async () => {
    render(<GuideDialog open onOpenChange={() => {}} />)
    expect(await axe(document.body)).toHaveNoViolations()
    fireEvent.click(screen.getByRole('tab', { name: 'Read the report, keep asking' }))
    expect(await axe(document.body)).toHaveNoViolations()
  })
})
