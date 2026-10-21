import type { Run } from '@xo/db'
import { type Deps, FenceError, fail, materialiseRun, tick } from '@xo/engine'

export type WorkerLoopOptions = Deps & {
  owner: string
  leaseMs: number
  pollMs: number
  maxConcurrent: number
  signal: AbortSignal
}

const TERMINAL: Run['status'][] = ['done', 'failed', 'cancelled']
const isTerminal = (run: Run) => TERMINAL.includes(run.status)

export async function runWorkerLoop(opts: WorkerLoopOptions): Promise<void> {
  const { signal, store, owner, leaseMs, pollMs, maxConcurrent, log } = opts

  const wait = (ms: number) =>
    new Promise<void>((resolve) => {
      if (signal.aborted) return resolve()
      const done = () => {
        signal.removeEventListener('abort', done)
        resolve()
      }
      signal.addEventListener('abort', done, { once: true })
      opts.sleep(ms).then(done, done)
    })

  const materialise = async (run: Run) => {
    try {
      await materialiseRun(store, run.id)
    } catch (err) {
      log('materialise failed', { runId: run.id, error: err })
    }
  }

  const cleanupCancelled = async (run: Run) => {
    const simulationId = run.ids.simulationId
    if (!simulationId || (run.stage !== 'sim_run' && run.stage !== 'report')) return
    try {
      await opts.mirofish.simulation.stop(simulationId)
    } catch (error) {
      log('simulation stop failed', { runId: run.id, simulationId, error })
    }
    try {
      await opts.mirofish.simulation.closeEnv(simulationId)
    } catch (error) {
      log('simulation closeEnv failed', { runId: run.id, simulationId, error })
    }
  }

  const handleLost = async (run: Run) => {
    try {
      const latest = await store.get(run.id)
      if (!latest) {
        await cleanupCancelled(run)
        log('run deleted', { runId: run.id, owner })
        return
      }
      if (latest.status === 'cancelled') {
        await cleanupCancelled(latest)
        await materialise(latest)
        log('run cancelled', { runId: run.id, owner })
        return
      }
    } catch (error) {
      log('cancel check failed', { runId: run.id, error })
    }
    log('lease lost', { runId: run.id, owner })
  }

  const release = async (run: Run) => {
    try {
      await store.releaseLease(run.id, owner)
      log('lease released', { runId: run.id, owner })
    } catch (error) {
      log('lease release failed', { runId: run.id, error })
    }
  }

  const tickWithHeartbeat = async (run: Run, deps: Deps) => {
    const timer = setInterval(() => {
      store.renewLease(run.id, owner, leaseMs).catch((error) => log('lease renew failed', { runId: run.id, error }))
    }, leaseMs / 3)
    try {
      return await tick(run, deps)
    } finally {
      clearInterval(timer)
    }
  }

  const drive = async (claimed: Run) => {
    const deps: Deps = { ...opts, fence: { owner } }
    let run = claimed
    let stage = run.stage
    while (!isTerminal(run) && !signal.aborted) {
      if (!(await store.renewLease(run.id, owner, leaseMs))) return handleLost(run)
      try {
        run = await tickWithHeartbeat(run, deps)
      } catch (err) {
        if (err instanceof FenceError) return handleLost(run)
        try {
          run = await fail(run, deps, run.stage, err)
        } catch (failErr) {
          if (failErr instanceof FenceError) return handleLost(run)
          throw failErr
        }
      }
      if (run.stage !== stage || isTerminal(run)) {
        stage = run.stage
        await materialise(run)
      }
      if (!isTerminal(run)) await wait(pollMs)
    }
    if (!isTerminal(run)) await release(run)
  }

  while (!signal.aborted) {
    try {
      const run = await store.claimNext(owner, leaseMs, maxConcurrent)
      if (!run) {
        await wait(pollMs)
        continue
      }
      log('run claimed', { runId: run.id, owner, stage: run.stage })
      await drive(run)
    } catch (err) {
      log('worker loop error', { owner, error: err })
      await wait(pollMs)
    }
  }
}
