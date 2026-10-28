import type { ReactNode } from 'react'
import { ThemeToggle } from '@/modules/chat/header/theme-toggle'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-svh w-full bg-background">
      <div className="absolute top-3 right-3 z-20">
        <ThemeToggle />
      </div>
      {children}
    </div>
  )
}
