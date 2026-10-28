// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { axe } from '@/test/axe'

vi.mock('next/navigation', () => ({ usePathname: () => '/c/x' }))
vi.mock('@/modules/guide/scenes/ask', () => ({ AskScene: () => <div>ask</div> }))
vi.mock('@/modules/guide/scenes/watch', () => ({ WatchScene: () => <div>watch</div> }))
vi.mock('@/modules/guide/scenes/interview', () => ({ InterviewScene: () => <div>interview</div> }))
vi.mock('@/modules/guide/scenes/report', () => ({ ReportScene: () => <div>report</div> }))

import { GuideProvider } from '@/modules/guide/guide-provider'
import { GuideButton } from './guide-button'

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

afterEach(cleanup)

describe('GuideButton', () => {
  it('opens the guide', async () => {
    const { container } = render(
      <TooltipProvider>
        <GuideProvider>
          <GuideButton />
        </GuideProvider>
      </TooltipProvider>,
    )
    expect(await axe(container)).toHaveNoViolations()
    fireEvent.click(screen.getByRole('button', { name: 'How it works' }))
    expect(screen.getByRole('dialog', { name: 'How Xenet Opinions works' })).toBeTruthy()
  })
})
