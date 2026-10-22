'use client'

import { useEffect, useRef, useState } from 'react'

export type EnvState = 'none' | 'open' | 'closed'
export type EnvSeed = { envState: EnvState; envKeepaliveUntil: string | null }
export type EnvStatus = { state: EnvState; minutesLeft: number | null }

const TICK_MS = 30_000

export function useEnvStatus(
  chatId: string,
  opts: { seed: EnvSeed | null; refreshKey: number; fetch?: typeof fetch },
): EnvStatus {
  const { refreshKey } = opts
  const [env, setEnv] = useState<EnvSeed | null>(opts.seed)
  const [now, setNow] = useState(() => Date.now())
  const fetchRef = useRef(opts.fetch)
  const seededKey = useRef(refreshKey)
  const seedKey = opts.seed ? `${opts.seed.envState}|${opts.seed.envKeepaliveUntil}` : ''
  const [adoptedSeedKey, setAdoptedSeedKey] = useState(seedKey)
  if (adoptedSeedKey !== seedKey) {
    setAdoptedSeedKey(seedKey)
    setEnv(opts.seed)
    setNow(Date.now())
  }

  useEffect(() => {
    fetchRef.current = opts.fetch
  })

  useEffect(() => {
    if (refreshKey === seededKey.current) return
    const controller = new AbortController()
    void (async () => {
      const load = fetchRef.current ?? fetch
      const response = await load(`/api/chats/${chatId}/run`, { signal: controller.signal }).catch(() => null)
      const body = response?.ok ? ((await response.json().catch(() => null)) as Partial<EnvSeed> | null) : null
      if (!body || controller.signal.aborted) return
      setEnv({ envState: body.envState ?? 'none', envKeepaliveUntil: body.envKeepaliveUntil ?? null })
      setNow(Date.now())
    })()
    return () => controller.abort()
  }, [chatId, refreshKey])

  const open = env?.envState === 'open'
  useEffect(() => {
    if (!open) return
    const timer = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(timer)
  }, [open])

  if (!env || env.envState === 'none') return { state: 'none', minutesLeft: null }
  if (env.envState === 'closed') return { state: 'closed', minutesLeft: null }
  if (!env.envKeepaliveUntil) return { state: 'open', minutesLeft: null }
  const msLeft = Date.parse(env.envKeepaliveUntil) - now
  if (msLeft <= 0) return { state: 'closed', minutesLeft: null }
  return { state: 'open', minutesLeft: Math.ceil(msLeft / 60_000) }
}
