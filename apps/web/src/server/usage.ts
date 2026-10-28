import { QUOTA_WINDOW_MS } from '@xo/engine'
import type { Limits } from './limits'
import { runsStartedSince } from './runs'
import { type Usage, usageFrom } from './usage-from'

export type { Usage } from './usage-from'

export async function getUsage(userId: string, limits: Limits, now = new Date()): Promise<Usage | null> {
  if (!limits.demoMode) return null
  return usageFrom(await runsStartedSince(userId, new Date(now.getTime() - QUOTA_WINDOW_MS)), limits)
}
