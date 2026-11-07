import { z } from 'zod'
import { getSessionUser } from '@/lib/session'
import { allowImprove, improvePrompt } from '@/server/prompt/improve'

export const runtime = 'nodejs'
export const maxDuration = 30

const bodySchema = z.object({ text: z.string().trim().min(1).max(20_000) })

export async function POST(request: Request) {
  const user = await getSessionUser(request.headers)
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 })

  const body = bodySchema.safeParse(await request.json().catch(() => null))
  if (!body.success) return Response.json({ error: 'invalid_body' }, { status: 400 })

  if (!allowImprove(user.id)) return Response.json({ error: 'rate_limited' }, { status: 429 })

  const text = await improvePrompt(body.data.text)
  if (!text) return Response.json({ error: 'improve_failed' }, { status: 502 })
  return Response.json({ text })
}
