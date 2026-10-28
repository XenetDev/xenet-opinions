import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { signInAvailable } from '@/lib/auth-providers'
import { getSessionUser } from '@/lib/session'
import { Chat } from '@/modules/chat/chat'
import { loadChatPage } from '@/server/chat-page'
import { getOwnedChat } from '@/server/chats'
import { getLimits } from '@/server/limits'
import { getUsage } from '@/server/usage'

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getSessionUser(await headers())
  if (!user) notFound()
  const chat = await getOwnedChat(id, user.id)
  if (!chat) notFound()

  const limits = getLimits(user)
  const [{ initialMessages, activeRun, latestRun }, usage] = await Promise.all([
    loadChatPage(chat.id, user.id),
    getUsage(user.id, limits),
  ])

  const signIn =
    limits.anonymous && limits.demoMode && signInAvailable()
      ? { max: limits.signedInMaxRunsPerDay, href: `/sign-in?next=${encodeURIComponent(`/c/${chat.id}`)}` }
      : undefined

  return (
    <Chat
      key={activeRun?.id ?? 'idle'}
      chatId={chat.id}
      initialMessages={initialMessages}
      activeRun={activeRun}
      latestRun={latestRun && { ...latestRun, envKeepaliveUntil: latestRun.envKeepaliveUntil?.toISOString() ?? null }}
      limits={limits}
      usage={usage}
      {...(signIn ? { signIn } : {})}
      startedAt={chat.createdAt.toISOString()}
    />
  )
}
