'use client'

import { usePathname } from 'next/navigation'
import { createContext, type ReactNode, useContext, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import type { AuthProviders } from '@/lib/auth-providers'
import { SignInForm } from './sign-in-form'

type SignInDialog = { open: () => void }

const NOOP: SignInDialog = { open: () => {} }

const SignInDialogContext = createContext<SignInDialog>(NOOP)

export function useSignInDialog(): SignInDialog {
  return useContext(SignInDialogContext)
}

export function SignInDialogProvider({ providers, children }: { providers: AuthProviders; children: ReactNode }) {
  const [isOpen, setOpen] = useState(false)
  const pathname = usePathname()
  const value = useMemo(() => ({ open: () => setOpen(true) }), [])

  return (
    <SignInDialogContext.Provider value={value}>
      {children}
      <Dialog open={isOpen} onOpenChange={setOpen}>
        <DialogContent
          aria-describedby={undefined}
          overlayClassName="backdrop-blur-sm supports-backdrop-filter:backdrop-blur-sm"
          className="gap-0 bg-transparent p-0 ring-0 sm:max-w-[26rem]"
        >
          <DialogTitle className="sr-only">Sign in</DialogTitle>
          <SignInForm providers={providers} next={pathname} />
        </DialogContent>
      </Dialog>
    </SignInDialogContext.Provider>
  )
}
