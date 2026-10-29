import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { describe, expect, it, vi } from 'vitest'
import { createStorageFromEnv } from './from-env'
import { createS3Storage } from './s3'
import { uploadKey } from './upload-key'

const opts = { bucket: 'b', region: 'us-east-1', accessKeyId: 'id', secretAccessKey: 'secret' }

function stub(send: ReturnType<typeof vi.fn>) {
  return { send } as unknown as S3Client
}

describe('createS3Storage', () => {
  it('put sends PutObjectCommand', async () => {
    const send = vi.fn().mockResolvedValue({})
    const bytes = new Uint8Array([1, 2])
    await createS3Storage(opts, stub(send)).put('k/1', bytes, 'text/plain')
    const cmd = send.mock.calls[0]![0]
    expect(cmd).toBeInstanceOf(PutObjectCommand)
    expect(cmd.input).toEqual({ Bucket: 'b', Key: 'k/1', Body: bytes, ContentType: 'text/plain' })
  })

  it('get reads the body to bytes', async () => {
    const out = new Uint8Array([9, 8])
    const send = vi.fn().mockResolvedValue({ Body: { transformToByteArray: async () => out } })
    const got = await createS3Storage(opts, stub(send)).get('k/1')
    expect(got).toEqual(out)
    const cmd = send.mock.calls[0]![0]
    expect(cmd).toBeInstanceOf(GetObjectCommand)
    expect(cmd.input).toEqual({ Bucket: 'b', Key: 'k/1' })
  })

  it('get maps NoSuchKey to not_found', async () => {
    const send = vi.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'NoSuchKey' }))
    await expect(createS3Storage(opts, stub(send)).get('k')).rejects.toMatchObject({
      name: 'StorageError',
      code: 'not_found',
    })
  })

  it('get rethrows other errors', async () => {
    const send = vi.fn().mockRejectedValue(new Error('boom'))
    await expect(createS3Storage(opts, stub(send)).get('k')).rejects.toThrow('boom')
  })

  it('delete sends DeleteObjectCommand', async () => {
    const send = vi.fn().mockResolvedValue({})
    await createS3Storage(opts, stub(send)).delete('k/1')
    const cmd = send.mock.calls[0]![0]
    expect(cmd).toBeInstanceOf(DeleteObjectCommand)
    expect(cmd.input).toEqual({ Bucket: 'b', Key: 'k/1' })
  })

  it('presignPut returns a signed URL for the key and the content-type header', async () => {
    const client = new S3Client({ region: 'us-east-1', credentials: { accessKeyId: 'id', secretAccessKey: 'secret' } })
    const storage = createS3Storage(opts, client)
    const signed = await storage.presignPut!('uploads/u1/x/a.pdf', {
      contentType: 'application/pdf',
      contentLength: 1234,
      expiresInSeconds: 600,
    })
    const url = new URL(signed.url)
    expect(url.pathname).toContain('uploads/u1/x/a.pdf')
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/)
    expect(url.searchParams.get('X-Amz-Expires')).toBe('600')
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain('content-length')
    expect(signed.headers).toEqual({ 'content-type': 'application/pdf' })
  })

  it('head returns size and content type', async () => {
    const send = vi.fn().mockResolvedValue({ ContentLength: 42, ContentType: 'text/plain' })
    expect(await createS3Storage(opts, stub(send)).head!('k/1')).toEqual({ size: 42, contentType: 'text/plain' })
    const cmd = send.mock.calls[0]![0]
    expect(cmd).toBeInstanceOf(HeadObjectCommand)
    expect(cmd.input).toEqual({ Bucket: 'b', Key: 'k/1' })
  })

  it('head returns null when the object is missing', async () => {
    const notFound = vi.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'NotFound' }))
    expect(await createS3Storage(opts, stub(notFound)).head!('k')).toBeNull()
    const status404 = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('x'), { name: 'Unknown', $metadata: { httpStatusCode: 404 } }))
    expect(await createS3Storage(opts, stub(status404)).head!('k')).toBeNull()
  })

  it('head rethrows other errors', async () => {
    const send = vi.fn().mockRejectedValue(new Error('boom'))
    await expect(createS3Storage(opts, stub(send)).head!('k')).rejects.toThrow('boom')
  })
})

describe('createStorageFromEnv', () => {
  it('defaults to local', () => {
    expect(createStorageFromEnv({ STORAGE_LOCAL_DIR: '/tmp/x' })).toBeDefined()
  })

  it('throws config error when s3 selected without credentials', () => {
    expect(() => createStorageFromEnv({ STORAGE_DRIVER: 's3', S3_BUCKET: 'b' })).toThrowError(
      expect.objectContaining({ name: 'StorageError', code: 'config' }),
    )
  })

  it('builds s3 storage when configured', () => {
    expect(
      createStorageFromEnv({
        STORAGE_DRIVER: 's3',
        S3_BUCKET: 'b',
        S3_REGION: 'r',
        S3_ACCESS_KEY_ID: 'i',
        S3_SECRET_ACCESS_KEY: 's',
        S3_ENDPOINT: 'http://localhost:9000',
        S3_FORCE_PATH_STYLE: 'true',
      }),
    ).toBeDefined()
  })
})

describe('uploadKey', () => {
  it('builds and sanitises', () => {
    expect(uploadKey('u1', 'up1', 'my file (1).pdf')).toBe('uploads/u1/up1/my_file__1_.pdf')
    expect(uploadKey('u', 'v', '')).toBe('uploads/u/v/file')
    expect(uploadKey('u', 'v', '..')).toBe('uploads/u/v/file')
    expect(uploadKey('u', 'v', 'a'.repeat(200)).split('/')[3]).toHaveLength(120)
  })
})
