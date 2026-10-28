'use client'

import { generateId } from 'ai'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import type { Limits } from '@/server/limits'
import type { Usage } from '@/server/usage-from'
import { Chat } from '../chat'
import type { SignInUpsell } from '../composer/usage-bar'
import type { RecentChat } from './welcome'

export function HomeChat({
  recent,
  limits,
  usage = null,
  signIn,
}: {
  recent: RecentChat[]
  limits: Limits
  signIn?: SignInUpsell
  usage?: Usage | null
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [chatId, setChatId] = useState(generateId)
  const firstId = useRef(chatId)
  const [shownAt, setShownAt] = useState(pathname)
  if (pathname !== shownAt) {
    setShownAt(pathname)
    if (pathname === '/') setChatId(generateId())
  }

  useEffect(() => {
    if (pathname === '/' ? chatId !== firstId.current : pathname !== `/c/${chatId}`) router.refresh()
  }, [pathname, chatId, router])

  if (pathname !== '/' && pathname !== `/c/${chatId}`) return null

  return (
    <Chat
      key={chatId}
      mode="new"
      chatId={chatId}
      initialMessages={[]}
      activeRun={null}
      latestRun={null}
      recent={recent}
      limits={limits}
      usage={usage}
      {...(signIn ? { signIn } : {})}
    />
  )
}
