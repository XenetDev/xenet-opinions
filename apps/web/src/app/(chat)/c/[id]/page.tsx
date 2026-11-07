import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { env } from '@/env'
import { getSessionUser } from '@/lib/session'
import { Chat } from '@/modules/chat/chat'
import { resolveLimits } from '@/server/billing/limits'
import { loadChatPage } from '@/server/chat-page'
import { getOwnedChat } from '@/server/chats'
import { shareUrl } from '@/server/share'

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getSessionUser(await headers())
  if (!user) notFound()
  const chat = await getOwnedChat(id, user.id)
  if (!chat) notFound()

  const { limits } = await resolveLimits(user)
  const { initialMessages, activeRun, latestRun, runFinishedAt, runShareTokens } = await loadChatPage(chat.id, user.id)
  const runShareUrls = Object.fromEntries(
    Object.entries(runShareTokens ?? {}).map(([messageId, token]) => [
      messageId,
      shareUrl(token, env.NEXT_PUBLIC_APP_URL),
    ]),
  )

  return (
    <Chat
      key={activeRun?.id ?? 'idle'}
      chatId={chat.id}
      initialMessages={initialMessages}
      activeRun={activeRun}
      latestRun={latestRun && { ...latestRun, envKeepaliveUntil: latestRun.envKeepaliveUntil?.toISOString() ?? null }}
      limits={limits}
      runFinishedAt={runFinishedAt}
      runShareUrls={runShareUrls}
      webResearchAvailable={!!env.EXA_API_KEY}
      startedAt={chat.createdAt.toISOString()}
    />
  )
}
