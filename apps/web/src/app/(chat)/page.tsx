import { headers } from 'next/headers'
import { getSessionUser } from '@/lib/session'
import { HomeChat } from '@/modules/chat/home/home-chat'
import { getLimits } from '@/server/limits'

export default async function Home() {
  const user = await getSessionUser(await headers())
  const limits = getLimits(user ?? { isAnonymous: true })

  return <HomeChat limits={limits} />
}
