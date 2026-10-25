import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getSessionUser } from '@/lib/session'
import { Chat } from '@/modules/chat/chat'
import { loadChatPage } from '@/server/chat-page'
import { getOwnedChat } from '@/server/chats'
import { getLimits } from '@/server/limits'

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

  const { initialMessages, activeRun, latestRun } = await loadChatPage(chat.id, user.id)

  return (
    <Chat
      key={activeRun?.id ?? 'idle'}
      chatId={chat.id}
      initialMessages={initialMessages}
      activeRun={activeRun}
      latestRun={latestRun && { ...latestRun, envKeepaliveUntil: latestRun.envKeepaliveUntil?.toISOString() ?? null }}
      initialText={typeof q === 'string' ? q : undefined}
      limits={getLimits()}
    />
  )
}
