import { z } from 'zod'

export const Task = z
  .object({
    task_id: z.string(),
    task_type: z.string().optional(),
    status: z.enum(['pending', 'processing', 'completed', 'failed']),
    progress: z.number(),
    message: z.string().nullish(),
    progress_detail: z.unknown().optional(),
    result: z.unknown().optional(),
    error: z.string().nullish(),
  })
  .loose()
export type Task = z.infer<typeof Task>

export const OntologyResult = z
  .object({
    project_id: z.string(),
    project_name: z.string().optional(),
    ontology: z.unknown(),
    analysis_summary: z.string().optional(),
    files: z.array(z.unknown()).optional(),
    total_text_length: z.number().optional(),
  })
  .loose()
export type OntologyResult = z.infer<typeof OntologyResult>

export const BuildStarted = z
  .object({
    project_id: z.string(),
    task_id: z.string().optional(),
    graph_id: z.string().optional(),
    reused: z.boolean().optional(),
    resumed: z.boolean().optional(),
    message: z.string().optional(),
  })
  .loose()
export type BuildStarted = z.infer<typeof BuildStarted>

export const GraphData = z.object({ nodes: z.array(z.unknown()), edges: z.array(z.unknown()) }).loose()
export type GraphData = z.infer<typeof GraphData>

export const Project = z.object({ project_id: z.string() }).loose()
export type Project = z.infer<typeof Project>
