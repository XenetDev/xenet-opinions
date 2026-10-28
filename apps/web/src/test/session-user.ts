import type { SessionUser } from '@/lib/session'

export function sessionUser(over: Partial<SessionUser> = {}): SessionUser {
  return { id: 'user1', isAnonymous: true, email: 'anon@example.invalid', name: 'Guest', image: null, ...over }
}
