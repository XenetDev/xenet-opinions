import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { sanitiseNext } from '@/lib/next-path'
import { getSessionUser } from '@/lib/session'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Sign in · Xenet Opinions',
  robots: { index: false, follow: false },
}

type SearchParams = Record<string, string | string[] | undefined>

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

function withSignInDialog(next: string, expired: boolean): string {
  const url = new URL(next, 'http://localhost')
  url.searchParams.set('signIn', '1')
  if (expired) url.searchParams.set('signInError', 'expired')
  return `${url.pathname}${url.search}${url.hash}`
}

export default async function SignInPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const next = sanitiseNext(first(params.next))
  const user = await getSessionUser(await headers())
  if (user && !user.isAnonymous) redirect(next)
  redirect(withSignInDialog(next, Boolean(first(params.error))))
}
