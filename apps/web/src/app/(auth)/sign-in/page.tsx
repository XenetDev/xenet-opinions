import type { Metadata } from 'next'
import { headers } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { authProviders } from '@/lib/auth-providers'
import { sanitiseNext } from '@/lib/next-path'
import { getSessionUser } from '@/lib/session'
import { SignInForm } from '@/modules/auth/sign-in-form'

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

  const providers = authProviders()

  return (
    <main className="flex min-h-svh w-full items-center justify-center px-4 py-6 sm:px-8 sm:py-10 lg:px-10">
      <div className="flex w-full max-w-[26rem] flex-col gap-5">
        <SignInForm providers={providers} next={next} error={error} />
        {Object.values(providers).some(Boolean) && (
          <p className="text-center text-sm text-muted-foreground">
            <Link href={next} className="underline-offset-4 hover:text-foreground hover:underline">
              Continue without signing in
            </Link>
          </p>
        )}
      </div>
    </main>
  )
}
