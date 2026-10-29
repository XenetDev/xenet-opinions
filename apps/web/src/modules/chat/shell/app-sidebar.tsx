'use client'

import { PlusIcon, SearchIcon } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { XoMark } from '@/components/brand/xo-mark'
import { Kbd } from '@/components/ui/kbd'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar'
import { authClient } from '@/lib/auth-client'
import { useChatActivity } from '../chat-activity'
import { useChatList } from '../chat-list-context'
import { GuideButton } from '../header/guide-button'
import { ThemeToggle } from '../header/theme-toggle'
import { AccountRow } from './account-row'
import { History } from './history'
import { UsageCard } from './usage-card'

export function AppSidebar({ signInAvailable, onSearch }: { signInAvailable: boolean; onSearch: () => void }) {
  const router = useRouter()
  const pathname = usePathname()
  const { chats } = useChatList()
  const { activity } = useChatActivity()
  const { state, isMobile, setOpenMobile } = useSidebar()
  const { data } = authClient.useSession()
  const collapsed = state === 'collapsed' && !isMobile
  const activeId = /^\/c\/([^/]+)/.exec(pathname)?.[1]
  const activeRunning = !!activity && activity.chatId === activeId && activity.running

  const newChat = () => {
    if (isMobile) setOpenMobile(false)
    router.push('/')
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 group-data-[collapsible=icon]:flex-col">
          <Link
            href="/"
            className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-sm font-semibold outline-hidden ring-sidebar-ring focus-visible:ring-2 group-data-[collapsible=icon]:flex-none group-data-[collapsible=icon]:px-1.5"
          >
            <XoMark className="h-auto w-5 shrink-0" />
            <span className={collapsed ? 'sr-only' : 'truncate'}>Xenet Opinions</span>
          </Link>
          <SidebarTrigger />
        </div>
        <SidebarMenu className="gap-1">
          <SidebarMenuItem>
            <SidebarMenuButton
              size="sm"
              tooltip="New chat"
              aria-keyshortcuts="Meta+Shift+O"
              onClick={newChat}
              className="bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground"
            >
              <PlusIcon aria-hidden="true" />
              <span className="flex-1">New chat</span>
              {!collapsed && (
                <Kbd aria-hidden="true" className="bg-primary-foreground/15 text-primary-foreground">
                  ⌘⇧O
                </Kbd>
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton size="sm" tooltip="Search chats" aria-keyshortcuts="Meta+K" onClick={onSearch}>
              <SearchIcon aria-hidden="true" />
              <span className="flex-1">Search chats</span>
              {!collapsed && <Kbd aria-hidden="true">⌘K</Kbd>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {!collapsed && (
          <History
            chats={chats}
            activeId={activeId}
            activeRunning={activeRunning}
            guest={data?.user?.isAnonymous === true}
          />
        )}
      </SidebarContent>
      <SidebarFooter>
        {!collapsed && <UsageCard />}
        <SidebarMenu>
          <SidebarMenuItem>
            <ThemeToggle variant="row" />
          </SidebarMenuItem>
          <SidebarMenuItem>
            <GuideButton variant="row" />
          </SidebarMenuItem>
          <AccountRow signInAvailable={signInAvailable} />
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
