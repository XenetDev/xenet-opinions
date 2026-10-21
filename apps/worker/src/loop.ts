import type { Run } from '@xo/db'
import { type Deps, fail, materialiseRun, tick } from '@xo/engine'

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

  const drive = async (claimed: Run) => {
    let run = claimed
    let stage = run.stage
    while (!isTerminal(run) && !signal.aborted) {
      if (!(await store.renewLease(run.id, owner, leaseMs))) {
        log('lease lost', { runId: run.id, owner })
        return
      }
      try {
        run = await tick(run, opts)
      } catch (err) {
        run = await fail(run, opts, run.stage, err)
      }
      if (run.stage !== stage || isTerminal(run)) {
        stage = run.stage
        await materialise(run)
      }
      if (!isTerminal(run)) await wait(pollMs)
    }
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
