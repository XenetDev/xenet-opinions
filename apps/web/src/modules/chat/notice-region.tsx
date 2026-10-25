'use client'

import { createContext, type ReactNode, useCallback, useContext, useEffect, useId, useState } from 'react'

type Announce = (source: string, text: string | null) => void

const AnnounceContext = createContext<Announce | null>(null)

export function useAnnounce(text: string | null): boolean {
  const announce = useContext(AnnounceContext)
  const source = useId()
  useEffect(() => {
    announce?.(source, text)
  }, [announce, source, text])
  useEffect(() => () => announce?.(source, null), [announce, source])
  return announce !== null
}

export function NoticeRegion({ notices, children }: { notices: (string | null)[]; children?: ReactNode }) {
  const [reported, setReported] = useState<Record<string, string>>({})
  const all: Record<string, string | null> = { ...reported }
  notices.forEach((text, index) => {
    all[`own-${index}`] = text
  })
  const [prev, setPrev] = useState(all)
  const [latest, setLatest] = useState<string | null>(null)
  const changed = Object.keys({ ...prev, ...all }).filter((key) => (all[key] ?? null) !== (prev[key] ?? null))
  if (changed.length > 0) {
    setPrev(all)
    const fresh = changed.findLast((key) => all[key])
    if (fresh) setLatest(fresh)
  }
  const text = (latest && all[latest]) || Object.values(all).findLast(Boolean) || null

  const announce = useCallback<Announce>(
    (source, next) =>
      setReported((current) => {
        if ((current[source] ?? null) === next) return current
        const { [source]: _, ...rest } = current
        return next === null ? rest : { ...rest, [source]: next }
      }),
    [],
  )

  return (
    <AnnounceContext.Provider value={announce}>
      {children}
      <p role="status" className="sr-only">
        {text}
      </p>
    </AnnounceContext.Provider>
  )
}
