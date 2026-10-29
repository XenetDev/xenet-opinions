'use client'

import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react'
import type { Usage } from '@/server/usage-from'

export type SignInUpsell = { max: number }

type UsageValue = { usage: Usage | null; signIn?: SignInUpsell; bump: () => void }

const UsageContext = createContext<UsageValue>({ usage: null, bump: () => {} })

export function UsageProvider({
  usage: seed,
  signIn,
  children,
}: {
  usage: Usage | null
  signIn?: SignInUpsell
  children: ReactNode
}) {
  const [usage, setUsage] = useState(seed)
  const [seen, setSeen] = useState(seed)
  if (seen !== seed) {
    setSeen(seed)
    setUsage(seed)
  }

  const bump = useCallback(
    () => setUsage((current) => current && { ...current, used: Math.min(current.used + 1, current.max) }),
    [],
  )

  const value = useMemo(() => ({ usage, bump, ...(signIn ? { signIn } : {}) }), [usage, signIn, bump])
  return <UsageContext.Provider value={value}>{children}</UsageContext.Provider>
}

export const useUsage = () => useContext(UsageContext)
