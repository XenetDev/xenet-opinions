'use client'

import { useRouter } from 'next/navigation'
import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion'

const EXAMPLES = [
  'How will customers react to a 20% price increase on our Pro plan?',
  'What happens to public opinion if the city bans e-scooters downtown?',
  'How would employees respond to a return-to-office mandate?',
]

export default function Home() {
  const router = useRouter()

  async function start(question: string) {
    const res = await fetch('/api/chats', { method: 'POST' })
    if (!res.ok) return
    const { id } = (await res.json()) as { id: string }
    router.push(`/c/${id}?q=${encodeURIComponent(question)}`)
    router.refresh()
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-4">
      <h1 className="text-2xl font-semibold">Xenet Opinions</h1>
      <p className="text-muted-foreground">Ask how a group of people would react to a decision.</p>
      <Suggestions className="flex-wrap justify-center">
        {EXAMPLES.map((question) => (
          <Suggestion key={question} suggestion={question} onClick={(q) => void start(q)} />
        ))}
      </Suggestions>
    </main>
  )
}
