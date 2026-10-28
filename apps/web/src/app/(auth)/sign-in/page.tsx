import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { authProviders } from '@/lib/auth-providers'
import { sanitiseNext } from '@/lib/next-path'
import { getSessionUser } from '@/lib/session'
import { SignInForm } from '@/modules/auth/sign-in-form'
import { SignInPanel } from '@/modules/auth/sign-in-panel'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Sign in · Xenet Opinions',
  robots: { index: false, follow: false },
}

type SearchParams = Record<string, string | string[] | undefined>

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

export default async function SignInPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const next = sanitiseNext(first(params.next))
  const user = await getSessionUser(await headers())
  if (user && !user.isAnonymous) redirect(next)
  const error = first(params.error) ? 'expired' : undefined

  return (
    <div className="w-full lg:grid lg:min-h-svh lg:grid-cols-[minmax(0,1fr)_600px]">
      <main className="flex min-h-svh items-center px-6 py-10 sm:px-10 lg:px-16 xl:px-20">
        <div className="mx-auto w-full max-w-[22rem]">
          <SignInForm providers={authProviders()} next={next} error={error} />
        </div>
      </main>
      <SignInPanel />
    </div>
  )
}
