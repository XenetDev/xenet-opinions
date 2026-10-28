'use client'

import { cn } from 'cn'
import { ArrowRightIcon, Loader2Icon } from 'lucide-react'
import Link from 'next/link'
import { type FormEvent, type ReactNode, type Ref, useEffect, useRef, useState } from 'react'
import { XoMark } from '@/components/brand/xo-mark'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { authClient } from '@/lib/auth-client'
import type { AuthProviders } from '@/lib/auth-providers'
import { AppleLogo, GithubLogo, GoogleLogo } from './provider-logos'

type Social = 'google' | 'github' | 'apple'

type State =
  | { status: 'idle' }
  | { status: 'sending'; via: 'email' | Social }
  | { status: 'sent'; email: string }
  | { status: 'error'; message: string }

const SOCIAL: { id: Social; label: string; Logo: () => ReactNode }[] = [
  { id: 'google', label: 'Google', Logo: GoogleLogo },
  { id: 'github', label: 'GitHub', Logo: GithubLogo },
  { id: 'apple', label: 'Apple', Logo: AppleLogo },
]

const HOSTING_DOCS = 'https://github.com/XenetDev/xenet-opinions/blob/main/docs/hosting.md'
const RATE_LIMITED = 'Too many attempts. Try again in a minute.'
const FAILED = 'Something went wrong. Try again.'
const INVALID_EMAIL = 'Enter a valid email address.'

function SignInCard({
  title,
  titleRef,
  description,
  children,
}: {
  title: string
  titleRef?: Ref<HTMLHeadingElement>
  description: ReactNode
  children: ReactNode
}) {
  return (
    <Card className="w-full gap-0 overflow-hidden p-0 shadow-sm">
      <CardHeader className="flex flex-col items-center gap-4 px-6 pt-8 pb-0 text-center sm:px-8 sm:pt-9">
        <div
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"
        >
          <XoMark className="w-6" />
        </div>
        <div className="flex flex-col gap-1.5">
          <h1
            ref={titleRef}
            tabIndex={titleRef ? -1 : undefined}
            className="text-xl font-semibold text-balance outline-none"
          >
            {title}
          </h1>
          <p className="text-sm text-pretty text-muted-foreground">{description}</p>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-6 px-6 pt-6 pb-6 sm:px-8 sm:pt-7 sm:pb-8">{children}</CardContent>
    </Card>
  )
}

export function SignInForm({ providers, next, error }: { providers: AuthProviders; next: string; error?: string }) {
  const [state, setState] = useState<State>({ status: 'idle' })
  const [email, setEmail] = useState('')
  const [expired, setExpired] = useState(error === 'expired')
  const sentHeading = useRef<HTMLHeadingElement>(null)
  const emailInput = useRef<HTMLInputElement>(null)
  const pending = state.status === 'sending'
  const social = SOCIAL.filter((provider) => providers[provider.id])

  useEffect(() => {
    if (state.status === 'sent') sentHeading.current?.focus()
  }, [state.status])

  if (!providers.magicLink && social.length === 0) {
    return (
      <SignInCard
        title="Sign-in is not set up on this instance"
        description={
          <>
            See the{' '}
            <a href={HOSTING_DOCS} className="text-foreground underline underline-offset-4">
              hosting docs
            </a>{' '}
            to turn on email or social sign-in.
          </>
        }
      >
        <Button asChild variant="outline" className="w-full">
          <Link href={next}>Continue without signing in</Link>
        </Button>
      </SignInCard>
    )
  }

  if (state.status === 'sent') {
    return (
      <SignInCard
        title="Check your email"
        titleRef={sentHeading}
        description={`We sent a sign-in link to ${state.email}.`}
      >
        <Button
          type="button"
          variant="link"
          className="self-center px-0"
          onClick={() => {
            setState({ status: 'idle' })
            requestAnimationFrame(() => emailInput.current?.focus())
          }}
        >
          Use a different email
        </Button>
      </SignInCard>
    )
  }

  async function sendLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const address = email.trim()
    setExpired(false)
    setState({ status: 'sending', via: 'email' })
    try {
      const result = await authClient.signIn.magicLink({
        email: address,
        callbackURL: next,
        errorCallbackURL: `/sign-in?next=${encodeURIComponent(next)}`,
      })
      const { error } = result
      if (!error || error.code === 'USER_NOT_FOUND') setState({ status: 'sent', email: address })
      else if (error.status === 400) setState({ status: 'error', message: INVALID_EMAIL })
      else if (error.status === 429) setState({ status: 'error', message: RATE_LIMITED })
      else setState({ status: 'error', message: FAILED })
    } catch {
      setState({ status: 'error', message: FAILED })
    }
  }

  async function continueWith(provider: Social) {
    setExpired(false)
    setState({ status: 'sending', via: provider })
    try {
      const result = await authClient.signIn.social({ provider, callbackURL: next })
      if (result.error) setState({ status: 'error', message: result.error.status === 429 ? RATE_LIMITED : FAILED })
    } catch {
      setState({ status: 'error', message: FAILED })
    }
  }

  return (
    <SignInCard title="Sign in" description="Keep your conversations and get more runs a day.">
      {expired && (
        <Alert>
          <AlertDescription>That link has expired or was already used. Request a new one.</AlertDescription>
        </Alert>
      )}
      {state.status === 'error' && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      {social.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {social.map(({ id, label, Logo }, index) => (
            <Button
              key={id}
              type="button"
              variant="outline"
              className={cn('w-full', social.length % 2 === 1 && index === social.length - 1 && 'col-span-2')}
              disabled={pending}
              aria-busy={pending && state.via === id}
              onClick={() => continueWith(id)}
            >
              <Logo />
              {label}
            </Button>
          ))}
        </div>
      )}

      {providers.magicLink && social.length > 0 && (
        <div className="flex items-center gap-3">
          <Separator className="flex-1" />
          <span className="text-xs text-muted-foreground">Or sign in with email</span>
          <Separator className="flex-1" />
        </div>
      )}

      {providers.magicLink && (
        <form className="flex flex-col gap-5" onSubmit={sendLink}>
          <Field className="gap-2">
            <FieldLabel htmlFor="sign-in-email">Email</FieldLabel>
            <Input
              ref={emailInput}
              id="sign-in-email"
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder="name@example.com"
              aria-describedby="sign-in-email-description"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <FieldDescription id="sign-in-email-description">Your link stays active for 15 minutes.</FieldDescription>
          </Field>
          <Button type="submit" className="w-full" disabled={pending} aria-busy={pending && state.via === 'email'}>
            Send sign-in link
            {pending && state.via === 'email' ? (
              <Loader2Icon data-icon="inline-end" aria-hidden="true" className="animate-spin" />
            ) : (
              <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
            )}
          </Button>
        </form>
      )}
    </SignInCard>
  )
}
