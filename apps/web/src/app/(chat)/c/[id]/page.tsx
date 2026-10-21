import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getSessionUser } from '@/lib/session'
import { getOwnedChat } from '@/server/chats'
import { loadChatPage } from '@/server/chat-page'
import { Chat } from '@/modules/chat/chat'

export default async function ChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ q?: string | string[] }>
}) {
  const { id } = await params
  const { q } = await searchParams
  const user = await getSessionUser(await headers())
  if (!user) notFound()
  const chat = await getOwnedChat(id, user.id)
  if (!chat) notFound()

  const { initialMessages, activeRun } = await loadChatPage(chat.id, user.id)

  return (
    <Chat
      key={activeRun?.id ?? 'idle'}
      chatId={chat.id}
      initialMessages={initialMessages}
      activeRun={activeRun}
      initialText={typeof q === 'string' ? q : undefined}
    />
  )
}
