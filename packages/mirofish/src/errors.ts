export type MiroFishErrorCode = 'api' | 'http' | 'timeout' | 'network' | 'schema'

export class MiroFishError extends Error {
  code: MiroFishErrorCode
  status?: number
  traceback?: string
  path: string

  constructor(init: {
    code: MiroFishErrorCode
    message: string
    path: string
    status?: number
    traceback?: string
    cause?: unknown
  }) {
    super(init.message, init.cause === undefined ? undefined : { cause: init.cause })
    this.name = 'MiroFishError'
    this.code = init.code
    this.path = init.path
    this.status = init.status
    this.traceback = init.traceback
  }
}
