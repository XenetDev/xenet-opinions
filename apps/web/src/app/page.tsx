'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

export default function Home() {
  const router = useRouter()

  async function createChat() {
    const res = await fetch('/api/chats', { method: 'POST' })
    if (!res.ok) return
    const { id } = (await res.json()) as { id: string }
    router.push(`/c/${id}`)
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold">Xenet Opinions</h1>
      <Button onClick={createChat}>New conversation</Button>
    </main>
  )
}
