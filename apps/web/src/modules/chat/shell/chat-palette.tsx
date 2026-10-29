'use client'

import { MessageSquareIcon, PlusIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Command, CommandDialog, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { useChatList } from '../chat-list-context'
import { chatTitle } from './chat-meta'

const MAX_CHATS = 50

export function ChatPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter()
  const { chats } = useChatList()
  const [query, setQuery] = useState('')
  const matches = [...chats]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .filter((chat) => chatTitle(chat).toLowerCase().includes(query.trim().toLowerCase()))
    .slice(0, MAX_CHATS)
  const searching = query.trim() !== ''

  const go = (href: string) => {
    onOpenChange(false)
    router.push(href)
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) setQuery('')
    onOpenChange(next)
  }

  const actions = (
    <CommandGroup heading="Actions">
      <CommandItem value="new-chat" onSelect={() => go('/')}>
        <PlusIcon aria-hidden="true" />
        New chat
      </CommandItem>
    </CommandGroup>
  )
  const chatGroup = (
    <CommandGroup heading="Chats">
      {matches.map((chat) => (
        <CommandItem key={chat.id} value={chat.id} onSelect={() => go(`/c/${chat.id}`)}>
          <MessageSquareIcon aria-hidden="true" />
          {chatTitle(chat)}
        </CommandItem>
      ))}
      {matches.length === 0 && <p className="py-4 text-center text-sm">No chats match</p>}
    </CommandGroup>
  )

  return (
    <CommandDialog open={open} onOpenChange={handleOpenChange} title="Search chats" description="Find a chat by title">
      <Command shouldFilter={false}>
        <CommandInput placeholder="Search chats…" value={query} onValueChange={setQuery} />
        <CommandList>
          {searching ? chatGroup : actions}
          {searching ? actions : chatGroup}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
