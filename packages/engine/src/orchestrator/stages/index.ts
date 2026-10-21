import type { ActiveStage, StageHandler } from '../types'
import { graphBuild } from './graph-build'
import { ontology } from './ontology'
import { report } from './report'
import { simCreate } from './sim-create'
import { simPrepare } from './sim-prepare'
import { simRun } from './sim-run'

export const HANDLERS: Record<ActiveStage, StageHandler> = {
  ontology,
  graph_build: graphBuild,
  sim_create: simCreate,
  sim_prepare: simPrepare,
  sim_run: simRun,
  report,
}
