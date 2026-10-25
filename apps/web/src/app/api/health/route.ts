import { sql } from 'drizzle-orm'
import { env } from '@/env'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Status = 'ok' | 'error'
type MirofishStatus = Status | 'skipped' | 'unauthorized'
type Health = { ok: boolean; db: Status; mirofish: MirofishStatus }

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

const MIROFISH_TIMEOUT_MS = 3_000

const checkMirofishHealth = async (base: string): Promise<Status> => {
  try {
    const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(MIROFISH_TIMEOUT_MS) })
    void res.body?.cancel()
    return res.ok ? 'ok' : 'error'
  } catch {
    return 'error'
  }
}

const checkMirofishToken = async (base: string): Promise<'ok' | 'error' | 'unauthorized'> => {
  const headers: Record<string, string> = env.MIROFISH_TOKEN ? { 'X-MiroFish-Token': env.MIROFISH_TOKEN } : {}
  try {
    const res = await fetch(`${base}/api/graph/task/health-probe`, {
      headers,
      signal: AbortSignal.timeout(MIROFISH_TIMEOUT_MS),
    })
    void res.body?.cancel()
    return res.status === 401 ? 'unauthorized' : 'ok'
  } catch {
    return 'error'
  }
}

const checkMirofish = async (): Promise<MirofishStatus> => {
  if (env.HEALTH_CHECK_MIROFISH === '0') return 'skipped'
  const base = env.MIROFISH_URL.replace(/\/$/, '')
  const [health, token] = await Promise.all([checkMirofishHealth(base), checkMirofishToken(base)])
  if (token === 'unauthorized') return 'unauthorized'
  return health === 'ok' && token === 'ok' ? 'ok' : 'error'
}

const computeHealth = async (): Promise<Health> => {
  const [dbStatus, mirofish] = await Promise.all([checkDb(), checkMirofish()])
  return { ok: dbStatus === 'ok' && mirofish !== 'error' && mirofish !== 'unauthorized', db: dbStatus, mirofish }
}

export async function GET() {
  const now = Date.now()
  if (!memo || now - memo.at >= HEALTH_MEMO_MS) memo = { at: now, body: computeHealth() }
  const body = await memo.body
  return Response.json(body, { status: body.ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } })
}
