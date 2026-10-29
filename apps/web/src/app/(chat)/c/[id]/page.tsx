import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getSessionUser } from '@/lib/session'
import { Chat } from '@/modules/chat/chat'
import { loadChatPage } from '@/server/chat-page'
import { getOwnedChat } from '@/server/chats'
import { getLimits } from '@/server/limits'

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getSessionUser(await headers())
  if (!user) notFound()
  const chat = await getOwnedChat(id, user.id)
  if (!chat) notFound()

  const limits = getLimits(user)
  const { initialMessages, activeRun, latestRun } = await loadChatPage(chat.id, user.id)

  return (
    <Chat
      key={activeRun?.id ?? 'idle'}
      chatId={chat.id}
      initialMessages={initialMessages}
      activeRun={activeRun}
      latestRun={latestRun && { ...latestRun, envKeepaliveUntil: latestRun.envKeepaliveUntil?.toISOString() ?? null }}
      limits={limits}
      startedAt={chat.createdAt.toISOString()}
    />
  )
}
