import type { Run } from '@xo/db'
import { MiroFishError, type Platform } from '@xo/mirofish'
import { advance, emit, need, remoteFailure, running } from '../emit'
import { closeEnvAndWait } from '../env'
import { fail, isRetriable, messageOf } from '../fail'
import { postsToFeed, rawPosts, runStatusToFeed } from '../mirofish-map'
import type { Deps, StageHandler } from '../types'

const PAGE = 50
const MAX_PAGES = 20
const MAX_START_ATTEMPTS = 3

const fetchPosts = async (deps: Deps, simulationId: string, platform: Platform, from: number, backlog: boolean) => {
  let offset = from
  const posts = []
  for (let i = 0; i < MAX_PAGES; i++) {
    const res = await deps.mirofish.simulation.posts(simulationId, { platform, limit: PAGE, offset })
    const count = rawPosts(res).length
    posts.push(...postsToFeed(res, platform))
    offset += count
    if (!backlog || count < PAGE) break
  }
  return { offset, posts }
}

const IDLE_POLLS_BEFORE_RESTART = 2

const onIdle = async (run: Run, deps: Deps) => {
  const idlePolls = (run.cursors.idlePolls ?? 0) + 1
  if (idlePolls < IDLE_POLLS_BEFORE_RESTART) return deps.store.update(run.id, { cursors: { idlePolls } }, deps.fence)
  if (run.cursors.startAcked) {
    return fail(
      run,
      deps,
      'sim_run',
      new MiroFishError({ code: 'api', message: 'simulation backend reported idle after start', path: 'run-status' }),
    )
  }
  const attempts = (run.cursors.startAttempts ?? 0) + 1
  if (attempts > MAX_START_ATTEMPTS) return fail(run, deps, 'sim_run', new Error('simulation never started'))
  deps.log('simulation idle after start, restarting', { runId: run.id, attempts })
  return deps.store.update(
    run.id,
    { cursors: { simStarted: false, startAttempts: attempts, idlePolls: 0 } },
    deps.fence,
  )
}

export const simRun: StageHandler = {
  stage: 'sim_run',
  hasEntered: (run) => run.cursors.simStarted === true,
  async enter(run, deps) {
    const simulationId = need(run.ids.simulationId, 'simulationId')
    const entered = await deps.store.update(run.id, { cursors: { simStarted: true } }, deps.fence)
    try {
      await deps.mirofish.simulation.start({ simulationId, maxRounds: run.config.maxRounds })
    } catch (err) {
      if (!isRetriable(err)) throw err
      deps.log('simulation start failed transiently, polling status', { runId: run.id, message: messageOf(err) })
      return entered
    }
    const acked = await deps.store.update(run.id, { cursors: { startAcked: true } }, deps.fence)
    await running(deps, acked, 'sim_run', { progress: 0, message: `Round 0/${run.config.maxRounds}` })
    return acked
  },
  async poll(run, deps) {
    const simulationId = need(run.ids.simulationId, 'simulationId')
    const status = await deps.mirofish.simulation.runStatus(simulationId)
    if (status.runner_status === 'idle') return onIdle(run, deps)
    if (status.runner_status === 'failed') {
      throw remoteFailure(status.error, 'Simulation failed', `/api/simulation/${simulationId}/run-status`)
    }
    const finished = status.runner_status === 'completed' || status.runner_status === 'stopped'
    // After the last round MiroFish stays 'running' (env waiting for commands) and refuses reports until it exits.
    const roundsDone = status.twitter_completed === true && status.reddit_completed === true
    const waiting = roundsDone && status.runner_status === 'running'
    const pause = waiting && run.config.pauseForInterviews === true && !run.cursors.envCloseRequested
    if (!finished && !pause && (waiting || run.cursors.envCloseRequested)) await closeEnvAndWait(run, deps, status)
    const backlog = finished || pause
    const twitter = await fetchPosts(deps, simulationId, 'twitter', run.cursors.postsOffsetTwitter ?? 0, backlog)
    const reddit = await fetchPosts(deps, simulationId, 'reddit', run.cursors.postsOffsetReddit ?? 0, backlog)
    const added = twitter.posts.length + reddit.posts.length
    const totalRounds = status.total_rounds || run.config.maxRounds
    const prev = run.cursors.feed
    const feed = runStatusToFeed(prev, { ...status, total_rounds: totalRounds }, [...twitter.posts, ...reddit.posts])
    if (!prev || feed.round !== prev.round || added > 0) await emit(deps, run, 'sim_feed', feed)
    if (!backlog) {
      const progress = status.progress_percent ?? Math.round((feed.round / totalRounds) * 100)
      await running(deps, run, 'sim_run', { progress, message: `Round ${feed.round}/${totalRounds}` })
    }
    const next = await deps.store.update(
      run.id,
      {
        cursors: {
          feed,
          postsOffsetTwitter: twitter.offset,
          postsOffsetReddit: reddit.offset,
          idlePolls: 0,
        },
      },
      deps.fence,
    )
    if (pause) return advance(deps, next, 'sim_run', 'interviews')
    return finished ? advance(deps, next, 'sim_run', 'report') : next
  },
}
