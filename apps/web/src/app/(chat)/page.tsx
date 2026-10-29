import { headers } from 'next/headers'
import { getSessionUser } from '@/lib/session'
import { HomeChat } from '@/modules/chat/home/home-chat'
import { listChats } from '@/server/chats'
import { getLimits } from '@/server/limits'

export default async function Home() {
  const user = await getSessionUser(await headers())
  const limits = getLimits(user ?? { isAnonymous: true })
  const chats = user ? await listChats(user.id) : []
  const recent = chats
    .filter((chat) => chat.title)
    .slice(0, 4)
    .map((chat) => ({
      id: chat.id,
      title: chat.title,
      updatedAt: chat.updatedAt.toISOString(),
      ...(chat.firstFile ? { firstFile: chat.firstFile } : {}),
    }))

  return <HomeChat recent={recent} limits={limits} />
}
