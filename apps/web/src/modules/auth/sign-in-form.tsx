'use client'

import { ArrowRightIcon, Loader2Icon } from 'lucide-react'
import Link from 'next/link'
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
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
  { id: 'google', label: 'Continue with Google', Logo: GoogleLogo },
  { id: 'github', label: 'Continue with GitHub', Logo: GithubLogo },
  { id: 'apple', label: 'Continue with Apple', Logo: AppleLogo },
]

const HOSTING_DOCS = 'https://github.com/XenetDev/xenet-opinions/blob/main/docs/hosting.md'
const RATE_LIMITED = 'Too many attempts. Try again in a minute.'
const FAILED = 'Something went wrong. Try again.'

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
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl leading-tight font-semibold text-balance">Sign-in is not set up on this instance</h1>
          <p className="text-base text-pretty text-muted-foreground">
            See the{' '}
            <a href={HOSTING_DOCS} className="text-foreground underline underline-offset-4">
              hosting docs
            </a>{' '}
            to turn on email or social sign-in.
          </p>
        </div>
        <Button asChild variant="outline" className="w-full">
          <Link href={next}>Continue without signing in</Link>
        </Button>
      </div>
    )
  }

  if (state.status === 'sent') {
    return (
      <div className="flex flex-col gap-2">
        <h1 ref={sentHeading} tabIndex={-1} className="text-3xl leading-tight font-semibold text-balance outline-none">
          Check your email
        </h1>
        <p className="text-base text-pretty text-muted-foreground">We sent a sign-in link to {state.email}.</p>
        <Button
          type="button"
          variant="link"
          className="self-start px-0"
          onClick={() => {
            setState({ status: 'idle' })
            requestAnimationFrame(() => emailInput.current?.focus())
          }}
        >
          Use a different email
        </Button>
      </div>
    )
  }

  async function sendLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const address = email.trim()
    setExpired(false)
    setState({ status: 'sending', via: 'email' })
    try {
      const result = await authClient.signIn.magicLink({ email: address, callbackURL: next })
      if (result.error?.status === 429) setState({ status: 'error', message: RATE_LIMITED })
      else setState({ status: 'sent', email: address })
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
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl leading-tight font-semibold text-balance">Sign in</h1>
        {providers.magicLink && (
          <p className="text-base text-pretty text-muted-foreground">Enter your email to get a sign-in link.</p>
        )}
      </div>

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
              className="bg-background"
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

      {providers.magicLink && social.length > 0 && (
        <div className="flex items-center gap-3">
          <Separator className="flex-1" />
          <span className="text-xs text-muted-foreground">Or continue with</span>
          <Separator className="flex-1" />
        </div>
      )}

      {social.length > 0 && (
        <div className="grid gap-3">
          {social.map(({ id, label, Logo }) => (
            <Button
              key={id}
              type="button"
              variant="outline"
              className="w-full justify-center px-4 [&_svg:not([class*='size-'])]:size-4"
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
    </div>
  )
}
