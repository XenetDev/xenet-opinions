'use client'

import { type ReactNode, useLayoutEffect, useState } from 'react'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { ChatHeader } from '../header/chat-header'
import { AppSidebar } from './app-sidebar'

export function Shell({
  signInAvailable,
  defaultOpen,
  hadCookie,
  children,
}: {
  signInAvailable: boolean
  defaultOpen: boolean
  hadCookie: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [, setSearchOpen] = useState(false)
  const onSearch = () => setSearchOpen(true)

  // biome-ignore lint/correctness/useExhaustiveDependencies: tablet default applies once on mount, bypassing the cookie so it is never saved as a choice
  useLayoutEffect(() => {
    if (!hadCookie && window.innerWidth < 1024) setOpen(false)
  }, [])

  return (
    <SidebarProvider open={open} onOpenChange={setOpen} className="h-svh">
      <AppSidebar signInAvailable={signInAvailable} onSearch={onSearch} />
      <SidebarInset className="min-h-0 min-w-0">
        <ChatHeader onSearch={onSearch} />
        <main className="flex min-h-0 flex-1 flex-col">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
