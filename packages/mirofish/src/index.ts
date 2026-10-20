import { type Http, type MiroFishClientOptions, createHttp } from './client'
import { graphEndpoints } from './endpoints/graph'
import { reportEndpoints } from './endpoints/report'
import { simulationEndpoints } from './endpoints/simulation'

export const createMiroFishClientFromHttp = (http: Http) => ({
  graph: graphEndpoints(http),
  simulation: simulationEndpoints(http),
  report: reportEndpoints(http),
})

export const createMiroFishClient = (opts: MiroFishClientOptions) => createMiroFishClientFromHttp(createHttp(opts))

export type MiroFishClient = ReturnType<typeof createMiroFishClient>

export { createHttp } from './client'
export type { Http, MiroFishClientOptions, RequestInitOptions } from './client'
export { MiroFishError } from './errors'
export { Envelope, PlatformSchema } from './schemas/common'
export type { Platform } from './schemas/common'
export * from './schemas/graph'
export * from './schemas/report'
export * from './schemas/simulation'
