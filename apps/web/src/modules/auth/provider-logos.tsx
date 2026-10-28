import type { ComponentType, SVGProps } from 'react'
import { Apple } from '@/components/ui/svgs/apple'
import { AppleDark } from '@/components/ui/svgs/appleDark'
import { GithubDark } from '@/components/ui/svgs/githubDark'
import { GithubLight } from '@/components/ui/svgs/githubLight'
import { Google } from '@/components/ui/svgs/google'

type Logo = ComponentType<SVGProps<SVGSVGElement>>

function ThemeLogo({ light: Light, dark: Dark }: { light: Logo; dark: Logo }) {
  return (
    <>
      <Light aria-hidden="true" className="dark:hidden" />
      <Dark aria-hidden="true" className="hidden dark:block" />
    </>
  )
}

export function GoogleLogo() {
  return <Google aria-hidden="true" />
}

export function GithubLogo() {
  return <ThemeLogo light={GithubLight} dark={GithubDark} />
}

export function AppleLogo() {
  return <ThemeLogo light={Apple} dark={AppleDark} />
}
