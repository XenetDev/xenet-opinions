import { headers } from 'next/headers'
import { env } from '@/env'
import { getSessionUser } from '@/lib/session'
import { HomeChat } from '@/modules/chat/home/home-chat'
import { resolveLimits } from '@/server/billing/limits'

export default async function Home() {
  const user = await getSessionUser(await headers())
  const { limits } = await resolveLimits(user)

  return <HomeChat limits={limits} webResearchAvailable={!!env.EXA_API_KEY} />
}
