// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { axe } from '@/test/axe'
import { NoticeRegion } from '../notice-region'
import { ContextCard, type SeedContext } from './context-card'

afterEach(cleanup)

const renderCard = (pending = false, initial?: SeedContext) => {
  const onStart = vi.fn()
  const onSkip = vi.fn()
  const view = render(<ContextCard onStart={onStart} onSkip={onSkip} pending={pending} initial={initial} />)
  return { ...view, onStart, onSkip }
}

const DRAFT = { background: 'Prices rose 10% last year', actors: 'Pro customers, support staff', change: 'A new fee' }

const field = (name: string) => screen.getByRole('textbox', { name }) as HTMLTextAreaElement

describe('ContextCard', () => {
  it('uses the exact copy', () => {
    renderCard()
    expect(screen.getByText('A little more context helps the simulation')).toBeTruthy()
    expect(screen.getByText('Needs you')).toBeTruthy()
    expect(screen.getByText('Optional. MiroFish simulates better when it knows the situation.')).toBeTruthy()
    expect(field('Background and constraints').placeholder).toBe('The rules, numbers and history that matter')
    expect(field('Who should be simulated').placeholder).toBe('Customers, staff, competitors, the press…')
    expect(field('What is changing').placeholder).toBe('The decision or event you want to test')
    expect(screen.getByRole('button', { name: 'Start run' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Skip and run with my question' })).toBeTruthy()
  })

  it('focuses the first field when it appears', () => {
    renderCard()
    expect(document.activeElement).toBe(field('Background and constraints'))
  })

  it('caps each field at 2000 characters', () => {
    renderCard()
    for (const name of ['Background and constraints', 'Who should be simulated', 'What is changing'])
      expect(field(name).maxLength).toBe(2000)
  })

  it('starts with only the non-empty trimmed fields', () => {
    const { onStart, onSkip } = renderCard()
    fireEvent.change(field('Background and constraints'), { target: { value: '  Prices rose 10%  ' } })
    fireEvent.change(field('Who should be simulated'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start run' }))
    expect(onStart).toHaveBeenCalledWith({ background: 'Prices rose 10%' })
    expect(onSkip).not.toHaveBeenCalled()
  })

  it('starts with an empty seed when nothing is filled', () => {
    const { onStart } = renderCard()
    fireEvent.click(screen.getByRole('button', { name: 'Start run' }))
    expect(onStart).toHaveBeenCalledWith({})
  })

  it('skips with nothing', () => {
    const { onStart, onSkip } = renderCard()
    fireEvent.change(field('What is changing'), { target: { value: 'A new fee' } })
    fireEvent.click(screen.getByRole('button', { name: 'Skip and run with my question' }))
    expect(onSkip).toHaveBeenCalledTimes(1)
    expect(onSkip.mock.calls[0]).toEqual([])
    expect(onStart).not.toHaveBeenCalled()
  })

  it('disables both buttons and the fields while pending', () => {
    renderCard(true)
    expect((screen.getByRole('button', { name: 'Start run' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Skip and run with my question' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
    expect(field('What is changing').disabled).toBe(true)
  })

  it('keeps Enter in a field for a new line', () => {
    const { onStart, onSkip } = renderCard()
    expect(fireEvent.keyDown(field('Background and constraints'), { key: 'Enter' })).toBe(true)
    expect(onStart).not.toHaveBeenCalled()
    expect(onSkip).not.toHaveBeenCalled()
  })

  describe('pre-filled with a draft', () => {
    it('shows the drafted values with the drafted copy and no skip', () => {
      renderCard(false, DRAFT)
      expect(screen.getByText('We drafted who to simulate')).toBeTruthy()
      expect(screen.getByText("Check these and run. Edit anything that's wrong.")).toBeTruthy()
      expect(screen.getByText('Needs you')).toBeTruthy()
      expect(screen.queryByText('A little more context helps the simulation')).toBeNull()
      expect(field('Background and constraints').value).toBe(DRAFT.background)
      expect(field('Who should be simulated').value).toBe(DRAFT.actors)
      expect(field('What is changing').value).toBe(DRAFT.change)
      expect(screen.getByRole('button', { name: 'Run with these' })).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'Start run' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Skip and run with my question' })).toBeNull()
    })

    it('runs with the drafted values', () => {
      const { onStart } = renderCard(false, DRAFT)
      fireEvent.click(screen.getByRole('button', { name: 'Run with these' }))
      expect(onStart).toHaveBeenCalledWith(DRAFT)
    })

    it('omits a field the user cleared', () => {
      const { onStart } = renderCard(false, DRAFT)
      fireEvent.change(field('What is changing'), { target: { value: '' } })
      fireEvent.click(screen.getByRole('button', { name: 'Run with these' }))
      expect(onStart).toHaveBeenCalledWith({ background: DRAFT.background, actors: DRAFT.actors })
    })

    it('announces the draft', () => {
      render(
        <NoticeRegion notices={[]}>
          <ContextCard onStart={vi.fn()} onSkip={vi.fn()} pending={false} initial={DRAFT} />
        </NoticeRegion>,
      )
      expect(screen.getByRole('status').textContent).toBe('We drafted who to simulate. Check these and run.')
    })

    it('has no axe violations', async () => {
      const { container } = renderCard(false, DRAFT)
      expect(await axe(container)).toHaveNoViolations()
    })
  })

  it('has no axe violations', async () => {
    const { container } = renderCard()
    expect(await axe(container)).toHaveNoViolations()
  })
})
