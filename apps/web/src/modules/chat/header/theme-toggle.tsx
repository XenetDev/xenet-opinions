'use client'

import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { SidebarMenuButton } from '@/components/ui/sidebar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const MODES = {
  light: { next: 'dark', label: 'Light', Icon: SunIcon },
  dark: { next: 'system', label: 'Dark', Icon: MoonIcon },
  system: { next: 'light', label: 'System', Icon: MonitorIcon },
} as const

function useMounted() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return mounted
}

function ThemeRow() {
  const { theme, setTheme } = useTheme()
  const mounted = useMounted()
  const mode = mounted && (theme === 'light' || theme === 'dark') ? theme : 'system'
  const { next, label, Icon } = MODES[mode]
  return (
    <SidebarMenuButton size="sm" tooltip="Theme" aria-label={`Theme: ${label}`} onClick={() => setTheme(next)}>
      <Icon aria-hidden="true" />
      <span className="flex-1">Theme</span>
      <span className="text-muted-foreground">{label}</span>
    </SidebarMenuButton>
  )
}

function ThemeIcon() {
  const { resolvedTheme, setTheme } = useTheme()
  const mounted = useMounted()
  const dark = mounted && resolvedTheme === 'dark'
  const label = dark ? 'Switch to light mode' : 'Switch to dark mode'
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} onClick={() => setTheme(dark ? 'light' : 'dark')}>
          {dark ? <SunIcon aria-hidden="true" /> : <MoonIcon aria-hidden="true" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export function ThemeToggle({ variant = 'icon' }: { variant?: 'icon' | 'row' }) {
  return variant === 'row' ? <ThemeRow /> : <ThemeIcon />
}
