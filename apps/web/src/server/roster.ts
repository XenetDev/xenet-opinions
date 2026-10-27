import type { Run } from '@xo/db'
import { AgentsDataSchema } from '@xo/engine/parts'
import { getMessage } from './chats'

export async function loadRoster(run: Pick<Run, 'assistantMessageId'>): Promise<Array<{ id: string; name: string }>> {
  const message = await getMessage(run.assistantMessageId)
  const part = message?.parts.findLast((p) => (p as { type?: unknown } | null)?.type === 'data-agents') as
    | { data?: unknown }
    | undefined
  const parsed = AgentsDataSchema.safeParse(part?.data)
  return parsed.success ? parsed.data.profiles.map(({ id, name }) => ({ id, name })) : []
}
