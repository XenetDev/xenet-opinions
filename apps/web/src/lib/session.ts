import { auth } from '@/lib/auth'

export async function getSessionUser(headers: Headers): Promise<{ id: string } | null> {
  const session = await auth.api.getSession({ headers })
  return session ? { id: session.user.id } : null
}
