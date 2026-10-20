import type { Http, RequestInitOptions } from '../client'
import { BuildStarted, GraphData, OntologyResult, Project, Task } from '../schemas/graph'

export type OntologyInput = {
  files: Array<{ name: string; bytes: Uint8Array; type: string }>
  requirement: string
  projectName?: string
  additionalContext?: string
}

const ONTOLOGY_TIMEOUT_MS = 600_000

export const graphEndpoints = (http: Http) => ({
  generateOntology(input: OntologyInput, init?: RequestInitOptions) {
    const form = new FormData()
    for (const f of input.files) form.append('files', new Blob([f.bytes as BlobPart], { type: f.type }), f.name)
    form.append('simulation_requirement', input.requirement)
    if (input.projectName !== undefined) form.append('project_name', input.projectName)
    if (input.additionalContext !== undefined) form.append('additional_context', input.additionalContext)
    return http.postForm('/api/graph/ontology/generate', form, OntologyResult, {
      ...init,
      timeoutMs: init?.timeoutMs ?? ONTOLOGY_TIMEOUT_MS,
    })
  },
  build(input: { projectId: string; force?: boolean }, init?: RequestInitOptions) {
    return http.postJson('/api/graph/build', { project_id: input.projectId, force: input.force }, BuildStarted, init)
  },
  getTask(taskId: string, init?: RequestInitOptions) {
    return http.getJson(`/api/graph/task/${encodeURIComponent(taskId)}`, Task, init)
  },
  getData(graphId: string, init?: RequestInitOptions) {
    return http.getJson(`/api/graph/data/${encodeURIComponent(graphId)}`, GraphData, init)
  },
  getProject(projectId: string, init?: RequestInitOptions) {
    return http.getJson(`/api/graph/project/${encodeURIComponent(projectId)}`, Project, init)
  },
})
