import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import type { ReactNode } from 'react'
import './globals.css'
import { Toaster } from 'sonner'
import { AnonymousSession } from '@/components/providers/anonymous-session'
import { ThemeProvider } from '@/components/providers/theme'
import { TooltipProvider } from '@/components/ui/tooltip'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
const description =
  'See how people react before you decide. Ask a question, add a brief, and watch a simulated public react on X and Reddit. Interview the personas, then read the report. Open source.'

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: { default: 'Xenet Opinions', template: '%s · Xenet Opinions' },
  description,
  applicationName: 'Xenet Opinions',
  openGraph: {
    type: 'website',
    siteName: 'Xenet Opinions',
    title: 'Xenet Opinions',
    description,
    url: '/',
    locale: 'en_GB',
  },
  twitter: { card: 'summary_large_image', title: 'Xenet Opinions', description },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <TooltipProvider delayDuration={500} skipDelayDuration={0}>
            <AnonymousSession>{children}</AnonymousSession>
          </TooltipProvider>
          <Toaster position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  )
}
