'use client'

import { type ReactNode, useEffect, useRef } from 'react'
import { authClient } from '@/lib/auth-client'

export function AnonymousSession({ children }: { children: ReactNode }) {
  const { data, isPending } = authClient.useSession()
  const attempted = useRef(false)

  useEffect(() => {
    if (isPending || data || attempted.current) return
    attempted.current = true
    void authClient.signIn.anonymous()
  }, [data, isPending])

  return <>{children}</>
}
