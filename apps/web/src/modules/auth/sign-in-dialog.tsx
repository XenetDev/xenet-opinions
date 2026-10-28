'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { createContext, type ReactNode, Suspense, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import type { AuthProviders } from '@/lib/auth-providers'
import { SignInForm } from './sign-in-form'

type SignInDialog = { open: () => void }

const NOOP: SignInDialog = { open: () => {} }

const SignInDialogContext = createContext<SignInDialog>(NOOP)

export function useSignInDialog(): SignInDialog {
  return useContext(SignInDialogContext)
}

function OpenFromSearchParams({ onOpen }: { onOpen: (expired: boolean) => void }) {
  const search = useSearchParams().toString()
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    const params = new URLSearchParams(search)
    if (params.get('signIn') !== '1') return
    onOpen(params.get('signInError') === 'expired')
    params.delete('signIn')
    params.delete('signInError')
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname)
  }, [search, pathname, router, onOpen])

  return null
}

export function SignInDialogProvider({ providers, children }: { providers: AuthProviders; children: ReactNode }) {
  const [isOpen, setOpen] = useState(false)
  const [expired, setExpired] = useState(false)
  const pathname = usePathname()
  const openFromParams = useCallback((linkExpired: boolean) => {
    setExpired(linkExpired)
    setOpen(true)
  }, [])
  const value = useMemo(
    () => ({
      open: () => {
        setExpired(false)
        setOpen(true)
      },
    }),
    [],
  )

  return (
    <SignInDialogContext.Provider value={value}>
      {children}
      <Suspense fallback={null}>
        <OpenFromSearchParams onOpen={openFromParams} />
      </Suspense>
      <Dialog open={isOpen} onOpenChange={setOpen}>
        <DialogContent
          aria-describedby={undefined}
          overlayClassName="backdrop-blur-sm supports-backdrop-filter:backdrop-blur-sm"
          className="gap-0 bg-transparent p-0 ring-0 sm:max-w-[26rem]"
        >
          <DialogTitle className="sr-only">Sign in</DialogTitle>
          <SignInForm providers={providers} next={pathname} {...(expired ? { error: 'expired' } : {})} />
        </DialogContent>
      </Dialog>
    </SignInDialogContext.Provider>
  )
}
