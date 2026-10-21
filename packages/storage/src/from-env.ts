import { createLocalStorage } from './local'
import { createS3Storage } from './s3'
import { StorageError, type Storage } from './types'

export type StorageEnv = {
  STORAGE_DRIVER?: string
  STORAGE_LOCAL_DIR?: string
  S3_BUCKET?: string
  S3_REGION?: string
  S3_ENDPOINT?: string
  S3_ACCESS_KEY_ID?: string
  S3_SECRET_ACCESS_KEY?: string
  S3_FORCE_PATH_STYLE?: string
}

export function createStorageFromEnv(env: StorageEnv): Storage {
  const driver = env.STORAGE_DRIVER || 'local'
  if (driver === 'local') return createLocalStorage(env.STORAGE_LOCAL_DIR || '.storage')
  if (driver === 's3') {
    const { S3_BUCKET: bucket, S3_REGION: region, S3_ACCESS_KEY_ID: accessKeyId, S3_SECRET_ACCESS_KEY: secretAccessKey } = env
    if (!bucket || !region || !accessKeyId || !secretAccessKey) {
      throw new StorageError('config', 's3 storage requires S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY')
    }
    return createS3Storage({
      bucket,
      region,
      accessKeyId,
      secretAccessKey,
      endpoint: env.S3_ENDPOINT || undefined,
      forcePathStyle: env.S3_FORCE_PATH_STYLE === 'true',
    })
  }
  throw new StorageError('config', `unknown STORAGE_DRIVER: ${driver}`)
}
