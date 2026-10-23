import { sql } from 'drizzle-orm'
import { env } from '@/env'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Status = 'ok' | 'error'
type Health = { ok: boolean; db: Status; mirofish: Status | 'skipped' }

const HEALTH_MEMO_MS = 5_000

let memo: { at: number; body: Promise<Health> } | null = null

const checkDb = async (): Promise<Status> => {
  try {
    await db.execute(sql`select 1`)
    return 'ok'
  } catch {
    return 'error'
  }
}

const checkMirofish = async (): Promise<Status | 'skipped'> => {
  if (env.HEALTH_CHECK_MIROFISH === '0') return 'skipped'
  try {
    const res = await fetch(`${env.MIROFISH_URL.replace(/\/$/, '')}/health`, { signal: AbortSignal.timeout(3000) })
    return res.ok ? 'ok' : 'error'
  } catch {
    return 'error'
  }
}

const computeHealth = async (): Promise<Health> => {
  const [dbStatus, mirofish] = await Promise.all([checkDb(), checkMirofish()])
  return { ok: dbStatus === 'ok' && mirofish !== 'error', db: dbStatus, mirofish }
}

export async function GET() {
  const now = Date.now()
  if (!memo || now - memo.at >= HEALTH_MEMO_MS) memo = { at: now, body: computeHealth() }
  const body = await memo.body
  return Response.json(body, { status: body.ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } })
}
