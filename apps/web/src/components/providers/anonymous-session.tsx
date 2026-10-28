'use client'

import { useRouter } from 'next/navigation'
import { type ReactNode, useEffect, useRef } from 'react'
import { authClient } from '@/lib/auth-client'

async function signInOnce(): Promise<boolean> {
  const current = await authClient.getSession()
  if (current.data) return false
  const result = await authClient.signIn.anonymous()
  return !result.error
}

export function AnonymousSession({ children }: { children: ReactNode }) {
  const router = useRouter()
  const { data, isPending } = authClient.useSession()
  const inFlight = useRef(false)

  useEffect(() => {
    if (isPending || data || inFlight.current) return
    inFlight.current = true
    const run = navigator.locks
      ? navigator.locks.request('xo-anonymous-session', signInOnce)
      : authClient.signIn.anonymous().then((result) => !result.error)
    void run
      .then((signedIn) => {
        if (signedIn) router.refresh()
      })
      .catch(() => {})
      .finally(() => {
        inFlight.current = false
      })
  }, [data, isPending, router])

  return <>{children}</>
}
