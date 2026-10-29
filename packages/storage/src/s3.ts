import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { type Storage, StorageError } from './types'

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
    async presignPut(key, { contentType, contentLength, expiresInSeconds }) {
      const command = new PutObjectCommand({ Bucket, Key: key, ContentType: contentType, ContentLength: contentLength })
      const url = await getSignedUrl(s3, command, { expiresIn: expiresInSeconds })
      return { url, headers: { 'content-type': contentType } }
    },
    async head(key) {
      try {
        const out = await s3.send(new HeadObjectCommand({ Bucket, Key: key }))
        return { size: out.ContentLength ?? 0, contentType: out.ContentType }
      } catch (err) {
        const { name, $metadata } = err as { name?: string; $metadata?: { httpStatusCode?: number } }
        if (name === 'NotFound' || name === 'NoSuchKey' || $metadata?.httpStatusCode === 404) return null
        throw err
      }
    },
  }
}
