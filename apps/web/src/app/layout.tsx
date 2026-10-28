import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import type { ReactNode } from 'react'
import './globals.css'
import { Toaster } from 'sonner'
import { AnonymousSession } from '@/components/providers/anonymous-session'
import { TooltipProvider } from '@/components/ui/tooltip'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Xenet Opinions',
  description: 'Xenet Opinions',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <TooltipProvider delayDuration={500} skipDelayDuration={0}>
          <AnonymousSession>{children}</AnonymousSession>
        </TooltipProvider>
        <Toaster position="bottom-center" />
      </body>
    </html>
  )
}
