'use client'

import { LogInIcon, LogOutIcon, Trash2Icon } from 'lucide-react'
import { useRouter } from 'next/navigation'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { authClient } from '@/lib/auth-client'
import { useSignInDialog } from '@/modules/auth/sign-in-dialog'

export function initials(name: string, email: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean).slice(0, 2)
  const letters = words.length ? words.map((word) => word.charAt(0)).join('') : email.trim().charAt(0)
  return letters.toUpperCase()
}

export function AccountRow({ signInAvailable }: { signInAvailable: boolean }) {
  const router = useRouter()
  const signInDialog = useSignInDialog()
  const { state, isMobile } = useSidebar()
  const { data, isPending } = authClient.useSession()
  const [deleting, setDeleting] = useState(false)
  const collapsed = state === 'collapsed' && !isMobile

  if (isPending || !data?.user) return null
  const { user } = data
  if (user.isAnonymous === true) {
    if (!collapsed || !signInAvailable) return null
    return (
      <SidebarMenuItem>
        <SidebarMenuButton size="sm" tooltip="Sign in" onClick={signInDialog.open}>
          <LogInIcon aria-hidden="true" />
          <span>Sign in</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    )
  }

  const name = user.name.trim()
  return (
    <SidebarMenuItem>
      <DropdownMenu>
        <Tooltip>
          <DropdownMenuTrigger asChild>
            <TooltipTrigger asChild>
              <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
                <Avatar size="sm" aria-hidden="true">
                  {user.image && <AvatarImage src={user.image} alt="" />}
                  <AvatarFallback>{initials(user.name, user.email)}</AvatarFallback>
                </Avatar>
                <span className="grid min-w-0 flex-1 text-left leading-tight">
                  {name && <span className="truncate text-sm font-medium">{user.name}</span>}
                  <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                </span>
              </SidebarMenuButton>
            </TooltipTrigger>
          </DropdownMenuTrigger>
          <TooltipContent side="right" align="center" hidden={!collapsed}>
            Account
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent side={isMobile ? 'top' : 'right'} align="end" className="w-56">
          <DropdownMenuLabel className="flex flex-col font-normal">
            {name && <span className="truncate text-sm font-medium">{user.name}</span>}
            <span className="truncate text-xs text-muted-foreground">{user.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={async () => {
              await authClient.signOut()
              await authClient.signIn.anonymous().catch(() => {})
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
    </SidebarMenuItem>
  )
}
