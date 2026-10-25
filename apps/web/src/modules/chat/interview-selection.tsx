'use client'

import { MAX_INTERVIEW_AGENTS } from '@xo/engine/parts'
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react'

type Persona = { id: string; name: string }

type InterviewSelection = {
  enabled: boolean
  selected: Persona[]
  isSelected: (id: string) => boolean
  toggle: (profile: Persona) => 'added' | 'removed' | 'full'
  remove: (id: string) => void
  clear: () => void
  max: number
}

const InterviewSelectionContext = createContext<InterviewSelection | null>(null)

export function InterviewSelectionProvider({
  enabled,
  max = MAX_INTERVIEW_AGENTS,
  children,
}: {
  enabled: boolean
  max?: number
  children: ReactNode
}) {
  const [selected, setSelected] = useState<Persona[]>([])

  useEffect(() => {
    if (!enabled) setSelected([])
  }, [enabled])

  const toggle = useCallback(
    (profile: Persona) => {
      if (selected.some((p) => p.id === profile.id)) {
        setSelected((prev) => prev.filter((p) => p.id !== profile.id))
        return 'removed' as const
      }
      if (selected.length >= max) return 'full' as const
      setSelected((prev) => [...prev, { id: profile.id, name: profile.name }])
      return 'added' as const
    },
    [selected, max],
  )

  const value = useMemo<InterviewSelection>(
    () => ({
      enabled,
      selected,
      isSelected: (id) => selected.some((p) => p.id === id),
      toggle,
      remove: (id) => setSelected((prev) => prev.filter((p) => p.id !== id)),
      clear: () => setSelected([]),
      max,
    }),
    [enabled, selected, toggle, max],
  )

  return <InterviewSelectionContext.Provider value={value}>{children}</InterviewSelectionContext.Provider>
}

export function useInterviewSelection(): InterviewSelection | null {
  return useContext(InterviewSelectionContext)
}
