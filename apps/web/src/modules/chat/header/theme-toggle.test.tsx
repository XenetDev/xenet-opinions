// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SidebarProvider } from '@/components/ui/sidebar'
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

const renderRow = () =>
  render(
    <TooltipProvider>
      <SidebarProvider>
        <ThemeToggle variant="row" />
      </SidebarProvider>
    </TooltipProvider>,
  )

describe('ThemeToggle', () => {
  it('keeps the icon button by default', () => {
    render(
      <TooltipProvider>
        <ThemeToggle />
      </TooltipProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Switch to dark mode' }))
    expect(themes.setTheme).toHaveBeenCalledWith('dark')
  })

  it.each([
    ['light', 'Light', 'dark', 'lucide-sun'],
    ['dark', 'Dark', 'system', 'lucide-moon'],
    ['system', 'System', 'light', 'lucide-monitor'],
  ])('as a row in %s mode shows %s and cycles to %s', async (theme, label, next, icon) => {
    themes.theme = theme
    const { container } = renderRow()
    const button = screen.getByRole('button', { name: `Theme: ${label}` })
    expect(button.querySelector('svg')?.getAttribute('class')).toContain(icon)
    fireEvent.click(button)
    expect(themes.setTheme).toHaveBeenCalledWith(next)
    expect(await axe(container)).toHaveNoViolations()
  })
})
