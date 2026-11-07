import type { Run } from '@xo/db'
import { interviewsToParts, mirofishAgentId } from '../follow-up/interviews'
import { INTERVIEW_CLIENT_TIMEOUT_MS, INTERVIEW_MIROFISH_TIMEOUT_S } from '../follow-up/keepalive'
import { withLanguage } from '../follow-up/language'
import { type AgentsData, AgentsDataSchema, type DebriefData } from '../parts'
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

const interviewBatch = async (run: Run, deps: Deps, platform: 'twitter' | 'reddit', batch: Profile[]) => {
  const requested = batch.map((p) => ({
    id: p.id,
    questionId: 'debrief',
    agentId: p.id,
    agentName: p.name,
    question: DEBRIEF_QUESTION,
  }))
  try {
    const result = await deps.mirofish.simulation.interviewBatch(
      {
        simulationId: need(run.ids.simulationId, 'simulationId'),
        interviews: batch.map((p) => ({
          agentId: mirofishAgentId(p.id),
          prompt: withLanguage(DEBRIEF_QUESTION, deps.locale),
        })),
        platform,
        timeout: INTERVIEW_MIROFISH_TIMEOUT_S,
      },
      { timeoutMs: INTERVIEW_CLIENT_TIMEOUT_MS },
    )
    return interviewsToParts(result, requested).map(
      (part): Answer =>
        part.status === 'done'
          ? { agentId: part.agentId, name: part.agentName, answer: part.answer, status: 'done' }
          : { agentId: part.agentId, name: part.agentName, status: 'failed' },
    )
  } catch (err) {
    deps.log('debrief batch failed', { runId: run.id, error: messageOf(err) })
    return batch.map((p): Answer => ({ agentId: p.id, name: p.name, status: 'failed' }))
  }
}

export async function runDebrief(run: Run, deps: Deps): Promise<Run> {
  const agents = await latestAgents(run, deps)
  const profiles = agents?.profiles ?? []
  const platform = agents?.platform ?? run.cursors.agentsPlatform ?? 'reddit'
  const answers: Answer[] = []
  for (let i = 0; i < profiles.length; i += BATCH) {
    answers.push(...(await interviewBatch(run, deps, platform, profiles.slice(i, i + BATCH))))
  }
  return deps.store.transition(run.id, { cursors: { debriefDone: true } }, [event('debrief', { answers })], deps.fence)
}
