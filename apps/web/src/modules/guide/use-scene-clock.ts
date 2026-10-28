'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'

const REDUCED = '(prefers-reduced-motion: reduce)'

function subscribe(onChange: () => void) {
  if (typeof window.matchMedia !== 'function') return () => {}
  const query = window.matchMedia(REDUCED)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

const prefersReduced = () => typeof window.matchMedia === 'function' && window.matchMedia(REDUCED).matches

export function useSceneClock({ active, steps }: { active: boolean; steps: number[] }): number {
  const reduced = useSyncExternalStore(subscribe, prefersReduced, () => false)
  const [phase, setPhase] = useState(0)
  if (!active && phase !== 0) setPhase(0)

  const running = active && !reduced
  const delay = steps[phase]
  const count = steps.length

  useEffect(() => {
    if (!running || delay === undefined) return
    const timer = setTimeout(() => setPhase((phase + 1) % count), delay)
    return () => clearTimeout(timer)
  }, [running, phase, delay, count])

  if (reduced) return count - 1
  return active ? phase : 0
}
