import { z } from 'zod'
import type { Message } from '@xo/db'
import type { OpinionsUIMessage } from '@xo/engine'

const rowSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  parts: z.array(z.unknown()),
})

export function toUIMessages(rows: Message[]): OpinionsUIMessage[] {
  return rows.flatMap((row) => {
    const parsed = rowSchema.safeParse(row)
    if (!parsed.success) {
      console.error('Dropping invalid message row', row.id, parsed.error.message)
      return []
    }
    return [parsed.data as OpinionsUIMessage]
  })
}
