'use client'

import { MoreHorizontalIcon } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { SidebarMenuAction, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'
import { useChatList } from './chat-list-context'
import { RenameDialog } from './rename-dialog'

export type SidebarChat = { id: string; title: string; runStatus: string }

export function ChatItem({ chat, active }: { chat: SidebarChat; active: boolean }) {
  const router = useRouter()
  const { upsertChat, removeChat } = useChatList()
  const [renaming, setRenaming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const label = chat.title || 'New conversation'
  const running = chat.runStatus === 'queued' || chat.runStatus === 'running'

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active}>
        <Link href={`/c/${chat.id}`}>
          <span className="truncate">{label}</span>
          {running && (
            <span
              data-testid="run-status-dot"
              role="img"
              aria-label="Run in progress"
              className="ml-auto size-2 shrink-0 rounded-full bg-emerald-500"
            >
              <span className="sr-only">Run in progress</span>
            </span>
          )}
        </Link>
      </SidebarMenuButton>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuAction showOnHover aria-label={`Actions for ${label}`}>
            <MoreHorizontalIcon />
          </SidebarMenuAction>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start">
          <DropdownMenuItem onSelect={() => setRenaming(true)}>Rename</DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {renaming && (
        <RenameDialog
          open
          onOpenChange={setRenaming}
          initialTitle={chat.title}
          onSubmit={async (title) => {
            const res = await fetch(`/api/chats/${chat.id}`, {
              method: 'PATCH',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ title }),
            }).catch(() => null)
            if (!res?.ok) return false
            upsertChat({ id: chat.id, title })
            router.refresh()
            return true
          }}
        />
      )}
      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes its messages and uploaded files. A run in progress will be cancelled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const res = await fetch(`/api/chats/${chat.id}`, { method: 'DELETE' }).catch(() => null)
                if (!res?.ok) return
                removeChat(chat.id)
                if (active) router.push('/')
                router.refresh()
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarMenuItem>
  )
}
