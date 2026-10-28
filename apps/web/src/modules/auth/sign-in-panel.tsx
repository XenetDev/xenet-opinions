import { CheckIcon } from 'lucide-react'
import { WaveDots } from '@/components/reui/wave-dots'

const BENEFITS = [
  'More runs a day than a guest',
  'Your conversations on every device',
  'Pick up a chat later, wherever you are',
]

export function SignInPanel() {
  return (
    <aside className="relative flex min-h-[34rem] overflow-hidden border-border/70 bg-muted/25 px-8 py-10 sm:px-12 lg:min-h-svh lg:border-l lg:px-14 lg:py-12">
      <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
        <WaveDots className="text-muted-foreground [mask-image:radial-gradient(86%_76%_at_50%_46%,black,transparent)]" />
      </div>
      <div className="relative z-10 mx-auto flex max-w-md flex-1 flex-col justify-center gap-6">
        <div className="flex flex-col gap-3">
          <h2 className="text-[1.625rem] leading-[1.34] font-semibold text-balance">
            Ask how people would react before you decide.
          </h2>
          <p className="text-base text-pretty text-muted-foreground">
            Attach a few documents, ask a question, and watch a simulated public form an opinion.
          </p>
        </div>
        <ul className="flex flex-col gap-2.5">
          {BENEFITS.map((benefit) => (
            <li key={benefit} className="flex items-center gap-2.5 text-sm">
              <CheckIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              {benefit}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  )
}
