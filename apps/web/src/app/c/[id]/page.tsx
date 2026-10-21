import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getSessionUser } from '@/lib/session'
import { getOwnedChat, listMessages } from '@/server/chats'
import { runStore } from '@/server/runs'
import { toUIMessages } from '@/server/ui-message'
import { Chat } from '@/modules/chat/chat'

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getSessionUser(await headers())
  if (!user) notFound()
  const chat = await getOwnedChat(id, user.id)
  if (!chat) notFound()

  const rows = await listMessages(chat.id)
  const initialMessages = toUIMessages(rows)

  return (
    <Chat
      chatId={chat.id}
      initialMessages={initialMessages}
      initialRunActive={!!(await runStore.getActiveByChat(chat.id))}
    />
  )
}
