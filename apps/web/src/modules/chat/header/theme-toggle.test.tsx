// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { axe } from '@/test/axe'

const themes = vi.hoisted(() => ({ theme: 'system' as string | undefined, resolvedTheme: 'light', setTheme: vi.fn() }))

vi.mock('next-themes', () => ({ useTheme: () => themes }))

import { ThemeToggle } from './theme-toggle'

beforeEach(() => {
  themes.theme = 'system'
  themes.resolvedTheme = 'light'
  themes.setTheme.mockReset()
})

afterEach(cleanup)

describe('ThemeToggle', () => {
  it('switches to dark from light', async () => {
    const { container } = render(
      <TooltipProvider>
        <ThemeToggle />
      </TooltipProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Switch to dark mode' }))
    expect(themes.setTheme).toHaveBeenCalledWith('dark')
    expect(await axe(container)).toHaveNoViolations()
  })
})
