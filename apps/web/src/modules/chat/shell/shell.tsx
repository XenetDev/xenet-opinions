'use client'

import { type ReactNode, useLayoutEffect, useState } from 'react'
import { SidebarInset, SidebarProvider, useSidebar } from '@/components/ui/sidebar'
import { ChatHeader } from '../header/chat-header'
import { AppSidebar } from './app-sidebar'

function TabletDefault() {
  const { setOpen } = useSidebar()
  // biome-ignore lint/correctness/useExhaustiveDependencies: tablet default applies once on mount so later toggles are never overridden
  useLayoutEffect(() => {
    if (window.innerWidth < 1024) setOpen(false)
  }, [])
  return null
}

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
  const [, setSearchOpen] = useState(false)
  const onSearch = () => setSearchOpen(true)

  return (
    <SidebarProvider defaultOpen={defaultOpen} className="h-svh">
      {!hadCookie && <TabletDefault />}
      <AppSidebar signInAvailable={signInAvailable} onSearch={onSearch} />
      <SidebarInset className="min-h-0 min-w-0">
        <ChatHeader onSearch={onSearch} />
        <main className="flex min-h-0 flex-1 flex-col">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
