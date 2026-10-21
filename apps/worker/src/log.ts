export function log(msg: string, meta?: Record<string, unknown>): void {
  const entry = { ts: new Date().toISOString(), msg, ...meta }
  try {
    console.log(JSON.stringify(entry, (_, v) => (v instanceof Error ? { name: v.name, message: v.message } : v)))
  } catch {
    console.log(JSON.stringify({ ts: entry.ts, msg }))
  }
}
