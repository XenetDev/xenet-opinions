import { needsSeedContext } from '@xo/engine/policy'
import type { Readiness } from './types'

export function fallbackReadiness(text: string, documentCount: number): Readiness {
  return needsSeedContext(text, documentCount)
    ? { ready: false, draft: { background: '', actors: '', change: '' } }
    : { ready: true }
}
