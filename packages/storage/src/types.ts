export type Storage = {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>
  get(key: string): Promise<Uint8Array>
  delete(key: string): Promise<void>
}

export type StorageErrorCode = 'invalid_key' | 'not_found' | 'config'

export class StorageError extends Error {
  readonly code: StorageErrorCode

  constructor(code: StorageErrorCode, message?: string) {
    super(message ?? code)
    this.name = 'StorageError'
    this.code = code
  }
}
