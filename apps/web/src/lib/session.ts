import { cache } from 'react'
import { auth } from '@/lib/auth'

export type SessionUser = { id: string; isAnonymous: boolean; email: string; name: string; image: string | null }

export const getSessionUser = cache(async (headers: Headers): Promise<SessionUser | null> => {
  const session = await auth.api.getSession({ headers })
  if (!session) return null
  const { user } = session
  return {
    id: user.id,
    isAnonymous: user.isAnonymous === true,
    email: user.email,
    name: user.name,
    image: user.image ?? null,
  }
})
