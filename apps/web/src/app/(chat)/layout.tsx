import { headers } from 'next/headers'
import type { ReactNode } from 'react'
import { authProviders, signInAvailable } from '@/lib/auth-providers'
import { getSessionUser } from '@/lib/session'
import { SignInDialogProvider } from '@/modules/auth/sign-in-dialog'
import { ChatActivityProvider } from '@/modules/chat/chat-activity'
import { ChatListProvider } from '@/modules/chat/chat-list-context'
import { ChatHeader } from '@/modules/chat/header/chat-header'
import { UsageProvider } from '@/modules/chat/shell/usage-context'
import { GuideProvider } from '@/modules/guide/guide-provider'
import { listChats } from '@/server/chats'
import { getLimits } from '@/server/limits'
import { getUsage } from '@/server/usage'

export default async function ChatLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser(await headers())
  const limits = getLimits(user ?? { isAnonymous: true })
  const [chats, usage] = user ? await Promise.all([listChats(user.id), getUsage(user.id, limits)]) : [[], null]
  const signIn =
    limits.anonymous && limits.demoMode && signInAvailable() ? { max: limits.signedInMaxRunsPerDay } : undefined

  return (
    <ChatListProvider chats={chats.map((chat) => ({ ...chat, updatedAt: chat.updatedAt.toISOString() }))}>
      <ChatActivityProvider>
        <SignInDialogProvider providers={authProviders()}>
          <UsageProvider usage={usage} {...(signIn ? { signIn } : {})}>
            <GuideProvider>
              <div className="flex h-svh flex-col">
                <ChatHeader signInAvailable={signInAvailable()} />
                <main className="flex min-h-0 flex-1 flex-col">{children}</main>
              </div>
            </GuideProvider>
          </UsageProvider>
        </SignInDialogProvider>
      </ChatActivityProvider>
    </ChatListProvider>
  )
}
