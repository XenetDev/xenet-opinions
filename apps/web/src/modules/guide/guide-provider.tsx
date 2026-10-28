'use client'

import { usePathname } from 'next/navigation'
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { GuideDialog } from './guide-dialog'

const STORAGE_KEY = 'xo.guide.v1'

export function hasSeenGuide(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'seen'
  } catch {
    return false
  }
}

export function markGuideSeen(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, 'seen')
  } catch {}
}

type Guide = { open: () => void }

const GuideContext = createContext<Guide>({ open: () => {} })

export function useGuide(): Guide {
  return useContext(GuideContext)
}

const dialogOpen = () =>
  document.querySelector('[role="dialog"]') !== null ||
  new URLSearchParams(window.location.search).get('signIn') === '1'

export function GuideProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    if (pathname !== '/' || hasSeenGuide()) return
    let timer = 0
    const frame = window.requestAnimationFrame(() => {
      timer = window.setTimeout(() => {
        if (!dialogOpen()) setOpen(true)
      }, 0)
    })
    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  }, [pathname])

  const onOpenChange = useCallback((next: boolean) => {
    if (!next) markGuideSeen()
    setOpen(next)
  }, [])
  const value = useMemo(() => ({ open: () => setOpen(true) }), [])

  return (
    <GuideContext.Provider value={value}>
      {children}
      <GuideDialog open={isOpen} onOpenChange={onOpenChange} />
    </GuideContext.Provider>
  )
}
