import type { Run } from '@xo/db'
import { advance, emit, need, remoteFailure, running } from '../emit'
import { agentLogToEvents } from '../mirofish-map'
import type { Deps, StageHandler } from '../types'

const MAX_PAGES = 20

const drain = async (run: Run, deps: Deps, reportId: string, untilEmpty: boolean) => {
  let current = run
  for (let i = 0; i < MAX_PAGES; i++) {
    const from = current.cursors.agentLogLine ?? 0
    const page = await deps.mirofish.report.agentLog(reportId, from)
    if (page.logs.length === 0) return { run: current, exhausted: true }
    const startN = current.cursors.reportEventCount ?? 0
    const { outline, events } = agentLogToEvents(page.logs, startN, current.cursors.reportOutline)
    if (outline) await emit(deps, current, 'report_outline', outline)
    for (const event of events) await emit(deps, current, 'report_event', event)
    current = await deps.store.update(current.id, {
      cursors: {
        agentLogLine: from + page.logs.length,
        reportEventCount: startN + events.length,
        ...(outline ? { reportOutline: outline } : {}),
      },
    })
    if (!untilEmpty && !page.has_more) break
  }
  return { run: current, exhausted: false }
}

export const report: StageHandler = {
  stage: 'report',
  hasEntered: (run) => Boolean(run.ids.reportId),
  async enter(run, deps) {
    const started = await deps.mirofish.report.generate({ simulationId: need(run.ids.simulationId, 'simulationId') })
    const entered = await deps.store.update(run.id, {
      ids: { reportId: started.report_id, ...(started.task_id ? { reportTaskId: started.task_id } : {}) },
    })
    await running(deps, entered, 'report', { message: 'Writing the report' })
    return entered
  },
  async poll(run, deps) {
    const reportId = need(run.ids.reportId, 'reportId')
    const drained = await drain(run, deps, reportId, false)
    const result = await deps.mirofish.report.get(reportId)
    if (result.status === 'failed') throw remoteFailure(result.error, 'Report generation failed', `/api/report/${reportId}`)
    if (result.status !== 'completed') return drained.run
    const final = await drain(drained.run, deps, reportId, true)
    if (!final.exhausted) return final.run
    await emit(deps, final.run, 'report_text', { markdown: result.markdown_content ?? '' })
    return advance(deps, final.run, 'report', 'finished')
  },
}
