import type { Run } from '@xo/db'
import type { InterviewBatchResult } from '@xo/mirofish'
import { interviewsToParts, mirofishAgentId } from '../follow-up/interviews'
import { INTERVIEW_CLIENT_TIMEOUT_MS, INTERVIEW_MIROFISH_TIMEOUT_S } from '../follow-up/keepalive'
import { withLanguage } from '../follow-up/language'
import { type AgentsData, AgentsDataSchema, type DebriefData } from '../parts'
import { FenceError } from '../store/types'
import { event, need } from './emit'
import { messageOf } from './fail'
import type { Deps } from './types'

export const DEBRIEF_QUESTION =
  'Thinking about everything discussed, what is your view of this decision? Would you go ahead with it yourself (buy, stay, accept, or whatever applies to you)? What is your single biggest concern?'
const BATCH = 10

type Answer = DebriefData['answers'][number]
type Profile = AgentsData['profiles'][number]

const latestAgents = async (run: Run, deps: Deps) => {
  const events = await deps.store.listEvents(run.id, 0)
  return AgentsDataSchema.safeParse(events.filter((e) => e.kind === 'agents').at(-1)?.payload).data
}

type Target = { simulationId: string; platform: 'twitter' | 'reddit'; prompt: string }

const interviewBatch = async (run: Run, deps: Deps, target: Target, batch: Profile[]) => {
  const requested = batch.map((p) => ({
    id: p.id,
    questionId: 'debrief',
    agentId: p.id,
    agentName: p.name,
    question: DEBRIEF_QUESTION,
  }))
  const input = {
    simulationId: target.simulationId,
    interviews: batch.map((p) => ({ agentId: mirofishAgentId(p.id), prompt: target.prompt })),
    platform: target.platform,
    timeout: INTERVIEW_MIROFISH_TIMEOUT_S,
  }
  let result: InterviewBatchResult
  try {
    result = await deps.mirofish.simulation.interviewBatch(input, { timeoutMs: INTERVIEW_CLIENT_TIMEOUT_MS })
  } catch (err) {
    deps.log('debrief batch failed', { runId: run.id, error: messageOf(err) })
    return batch.map((p): Answer => ({ agentId: p.id, name: p.name, status: 'failed' }))
  }
  return interviewsToParts(result, requested).map(
    (part): Answer =>
      part.status === 'done'
        ? { agentId: part.agentId, name: part.agentName, answer: part.answer, status: 'done' }
        : { agentId: part.agentId, name: part.agentName, status: 'failed' },
  )
}

const ensureActive = async (run: Run, deps: Deps) => {
  const latest = await deps.store.get(run.id)
  if (latest?.status !== 'running') throw new FenceError(run.id)
}

export async function runDebrief(run: Run, deps: Deps): Promise<Run> {
  const agents = await latestAgents(run, deps)
  const profiles = agents?.profiles ?? []
  const target: Target = {
    simulationId: need(run.ids.simulationId, 'simulationId'),
    platform: agents?.platform ?? run.cursors.agentsPlatform ?? 'reddit',
    prompt: withLanguage(DEBRIEF_QUESTION, deps.locale),
  }
  const answers: Answer[] = []
  for (let i = 0; i < profiles.length; i += BATCH) {
    if (i > 0) await ensureActive(run, deps)
    answers.push(...(await interviewBatch(run, deps, target, profiles.slice(i, i + BATCH))))
  }
  return deps.store.transition(run.id, { cursors: { debriefDone: true } }, [event('debrief', { answers })], deps.fence)
}
