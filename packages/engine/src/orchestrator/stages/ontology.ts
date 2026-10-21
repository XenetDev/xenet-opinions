import { safeUploadName } from '@xo/storage'
import { advance, emit, running } from '../emit'
import { ontologyToPart } from '../mirofish-map'
import type { StageHandler } from '../types'

export const ontology: StageHandler = {
  stage: 'ontology',
  hasEntered: (run) => Boolean(run.ids.projectId),
  async enter(run, deps) {
    await running(deps, run, 'ontology', { message: 'Reading your documents' })
    const uploads = await deps.store.listUploads(run.config.uploadIds)
    await emit(deps, run, 'sources', {
      files: uploads.map((u) => ({ id: u.id, filename: u.filename, mediaType: u.mediaType, sizeBytes: u.sizeBytes })),
    })
    const files = await Promise.all(
      uploads.map(async (u) => ({ name: safeUploadName(u.filename, u.mediaType), bytes: await deps.storage.get(u.storageKey), type: u.mediaType })),
    )
    const result = await deps.mirofish.graph.generateOntology({ files, requirement: run.config.requirement })
    const entered = await deps.store.update(run.id, { ids: { projectId: result.project_id } }, deps.fence)
    await emit(deps, entered, 'ontology', ontologyToPart(result))
    return advance(deps, entered, 'ontology', 'graph_build')
  },
  poll: (run, deps) => advance(deps, run, 'ontology', 'graph_build'),
}
