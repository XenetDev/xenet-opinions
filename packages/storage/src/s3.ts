import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { StorageError, type Storage } from './types'

export type S3StorageOptions = {
  bucket: string
  region: string
  endpoint?: string
  accessKeyId: string
  secretAccessKey: string
  forcePathStyle?: boolean
}

export function createS3Storage(opts: S3StorageOptions, client?: S3Client): Storage {
  const s3 =
    client ??
    new S3Client({
      region: opts.region,
      endpoint: opts.endpoint,
      forcePathStyle: opts.forcePathStyle,
      credentials: { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey },
    })
  const Bucket = opts.bucket

  return {
    async put(key, bytes, contentType) {
      await s3.send(new PutObjectCommand({ Bucket, Key: key, Body: bytes, ContentType: contentType }))
    },
    async get(key) {
      try {
        const out = await s3.send(new GetObjectCommand({ Bucket, Key: key }))
        if (!out.Body) throw new StorageError('not_found', `not found: ${key}`)
        return await out.Body.transformToByteArray()
      } catch (err) {
        if (err instanceof StorageError) throw err
        if ((err as { name?: string }).name === 'NoSuchKey') throw new StorageError('not_found', `not found: ${key}`)
        throw err
      }
    },
    async delete(key) {
      await s3.send(new DeleteObjectCommand({ Bucket, Key: key }))
    },
  }
}
