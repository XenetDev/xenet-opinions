'use client'

import { generateId } from 'ai'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import type { Limits } from '@/server/limits'
import { Chat } from '../chat'

export function HomeChat({ limits }: { limits: Limits }) {
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
      limits={limits}
    />
  )
}
