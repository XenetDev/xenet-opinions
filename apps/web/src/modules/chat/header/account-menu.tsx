'use client'

import { LogOutIcon, Trash2Icon } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { authClient } from '@/lib/auth-client'

export function initials(name: string, email: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean).slice(0, 2)
  const letters = words.length ? words.map((word) => word.charAt(0)).join('') : email.trim().charAt(0)
  return letters.toUpperCase()
}

export function AccountMenu() {
  const router = useRouter()
  const pathname = usePathname()
  const { data, isPending } = authClient.useSession()
  const [deleting, setDeleting] = useState(false)

  if (isPending || !data?.user) return null
  const { user } = data
  if (user.isAnonymous === true) {
    return (
      <Button asChild variant="ghost" size="sm">
        <Link href={`/sign-in?next=${encodeURIComponent(pathname)}`}>Sign in</Link>
      </Button>
    )
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" className="rounded-full" aria-label="Account menu">
            <Avatar size="sm">
              {user.image && <AvatarImage src={user.image} alt="" />}
              <AvatarFallback>{initials(user.name, user.email)}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="flex flex-col font-normal">
            <span className="truncate text-sm font-medium">{user.name}</span>
            <span className="truncate text-xs text-muted-foreground">{user.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={async () => {
              await authClient.signOut()
              router.push('/')
              router.refresh()
            }}
          >
            <LogOutIcon aria-hidden="true" />
            Sign out
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
            <Trash2Icon aria-hidden="true" />
            Delete account
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              We'll email you a confirmation link. Your conversations and uploads are removed once you confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const { error } = await authClient.deleteUser({ callbackURL: '/' })
                if (error) toast.error('Could not send the confirmation email')
                else toast.success('Confirmation email sent')
              }}
            >
              Send confirmation email
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
