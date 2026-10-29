'use client'

import { MessageSquareIcon, PlusIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Command, CommandDialog, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { useChatList } from '../chat-list-context'
import { chatTitle } from './chat-meta'

const MAX_CHATS = 50
const NEW_CHAT = 'new-chat'

export function ChatPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter()
  const { chats } = useChatList()
  const [query, setQuery] = useState('')
  const chatsByRecency = [...chats].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const matches = chatsByRecency
    .filter((chat) => chatTitle(chat).toLowerCase().includes(query.trim().toLowerCase()))
    .slice(0, MAX_CHATS)
  const [selected, setSelected] = useState(NEW_CHAT)

  const typed = useRef(false)
  const top = useRef(NEW_CHAT)
  const [reapply, setReapply] = useState(0)

  const onQueryChange = (text: string) => {
    typed.current = true
    setQuery(text)
    const needle = text.trim().toLowerCase()
    top.current =
      (needle && chatsByRecency.find((chat) => chatTitle(chat).toLowerCase().includes(needle))?.id) || NEW_CHAT
    setSelected(top.current)
  }

  const onSelectedChange = (value: string) => {
    setSelected(value)
    if (typed.current && value !== top.current) setReapply((n) => n + 1)
  }

  useEffect(() => {
    if (reapply) setSelected(top.current)
  }, [reapply])

  const handleOpenChange = (next: boolean) => {
    if (!next) onQueryChange('')
    onOpenChange(next)
  }

  const go = (href: string) => {
    handleOpenChange(false)
    router.push(href)
  }

  return (
    <CommandDialog
      className="sm:max-w-xl"
      open={open}
      onOpenChange={handleOpenChange}
      title="Search chats"
      description="Find a chat by title"
    >
      <Command
        shouldFilter={false}
        value={selected}
        onValueChange={onSelectedChange}
        onKeyDownCapture={() => {
          typed.current = false
        }}
      >
        <CommandInput placeholder="Search chats…" value={query} onValueChange={onQueryChange} />
        <CommandList>
          <CommandGroup heading="Actions">
            <CommandItem value={NEW_CHAT} onSelect={() => go('/')}>
              <PlusIcon aria-hidden="true" />
              New chat
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading="Chats">
            {matches.map((chat) => (
              <CommandItem key={chat.id} value={chat.id} onSelect={() => go(`/c/${chat.id}`)}>
                <MessageSquareIcon aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{chatTitle(chat)}</span>
              </CommandItem>
            ))}
            {matches.length === 0 && (
              <p className="py-4 text-center text-sm">
                {chats.length === 0 && !query.trim() ? 'No chats yet' : 'No chats match'}
              </p>
            )}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
