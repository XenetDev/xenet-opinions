import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('better-auth', () => ({ betterAuth: vi.fn(() => ({})) }))
vi.mock('@/env', () => ({ env: {} }))
vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/storage', () => ({ storage: {} }))

import type { BetterAuthOptions } from 'better-auth'
import { type Env, parseEnv } from '@/env.schema'
import { buildAuthOptions } from './auth'

const base = parseEnv({
  DATABASE_URL: 'postgresql://x:y@localhost:5432/z',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:3000',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  MIROFISH_URL: 'http://localhost:5001',
})

const send = vi.fn(async () => {})
const mailer = vi.fn(() => ({ kind: 'console' as const, send }))
const relink = vi.fn(async () => ({ chats: 0, runs: 0, uploads: 0 }))
const deleteStorage = vi.fn(async () => {})

beforeEach(() => {
  vi.clearAllMocks()
})

function build(over: Partial<Env>, nodeEnv: string | undefined): BetterAuthOptions {
  return buildAuthOptions({
    env: { ...base, ...over },
    nodeEnv,
    db: {} as never,
    schema: {},
    mailer,
    relink,
    deleteStorage,
  })
}

type PluginOptions = Record<string, (...args: never[]) => Promise<unknown>>

function pluginOptions(options: BetterAuthOptions, id: string): PluginOptions {
  const plugin = options.plugins?.find((p) => p.id === id) as { options?: PluginOptions } | undefined
  if (!plugin?.options) throw new Error(`plugin ${id} missing`)
  return plugin.options
}

const user = {
  id: 'u1',
  email: 'a@example.com',
  name: 'A',
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('buildAuthOptions', () => {
  it('has no social providers and only the anonymous plugin in production without a mail key', () => {
    const options = build({}, 'production')
    expect(Object.keys(options.socialProviders ?? {})).toEqual([])
    expect(options.plugins?.map((p) => p.id)).toEqual(['anonymous'])
    expect(options.trustedOrigins).toEqual(['http://localhost:3000'])
  })

  it('adds the magic-link plugin in development without a mail key', () => {
    expect(build({}, 'development').plugins?.map((p) => p.id)).toEqual(['anonymous', 'magic-link'])
  })

  it('adds the magic-link plugin in production with a mail key', () => {
    const options = build({ RESEND_API_KEY: 're_x', EMAIL_FROM: 'a@example.com' }, 'production')
    expect(options.plugins?.map((p) => p.id)).toEqual(['anonymous', 'magic-link'])
    expect(pluginOptions(options, 'magic-link')).toMatchObject({ expiresIn: 900, storeToken: 'hashed' })
  })

  it('configures only the enabled social providers', () => {
    const options = build({ GOOGLE_CLIENT_ID: 'gid', GOOGLE_CLIENT_SECRET: 'gsecret' }, 'production')
    expect(Object.keys(options.socialProviders ?? {})).toEqual(['google'])
    expect(options.socialProviders?.google).toEqual({ clientId: 'gid', clientSecret: 'gsecret' })
  })

  it('configures github', () => {
    const options = build({ GITHUB_CLIENT_ID: 'hid', GITHUB_CLIENT_SECRET: 'hsecret' }, 'production')
    expect(options.socialProviders?.github).toEqual({ clientId: 'hid', clientSecret: 'hsecret' })
  })

  it('configures apple and trusts its origin', () => {
    const options = build(
      {
        APPLE_CLIENT_ID: 'aid',
        APPLE_CLIENT_SECRET: 'asecret',
        APPLE_APP_BUNDLE_IDENTIFIER: 'ai.xenet.opinions',
      },
      'production',
    )
    expect(options.socialProviders?.apple).toEqual({
      clientId: 'aid',
      clientSecret: 'asecret',
      appBundleIdentifier: 'ai.xenet.opinions',
    })
    expect(options.trustedOrigins).toEqual(['http://localhost:3000', 'https://appleid.apple.com'])
  })

  it('rate limits in the database in every environment', () => {
    for (const nodeEnv of ['production', 'development', 'test', undefined]) {
      expect(build({}, nodeEnv).rateLimit).toEqual({
        enabled: true,
        window: 60,
        max: 60,
        storage: 'database',
        customRules: {
          '/sign-in/magic-link': { window: 60, max: 3 },
          '/sign-in/anonymous': { window: 60, max: 10 },
          '/delete-user': { window: 60, max: 3 },
        },
      })
    }
  })

  it('sets session lifetimes and ip headers', () => {
    const options = build({}, 'production')
    expect(options.session).toEqual({ expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 })
    expect(options.advanced?.ipAddress?.ipAddressHeaders).toEqual(['x-forwarded-for', 'x-real-ip'])
  })

  it('uses secure cookies only in production', () => {
    expect(build({}, 'production').advanced?.useSecureCookies).toBe(true)
    expect(build({}, 'development').advanced?.useSecureCookies).toBe(false)
    expect(build({}, undefined).advanced?.useSecureCookies).toBe(false)
  })

  it('keeps secret and baseURL from env', () => {
    const options = build({}, 'production')
    expect(options.secret).toBe(base.BETTER_AUTH_SECRET)
    expect(options.baseURL).toBe(base.BETTER_AUTH_URL)
  })

  it('relinks the anonymous user onto the new user and propagates failures', async () => {
    const { onLinkAccount } = pluginOptions(build({}, 'production'), 'anonymous')
    const data = {
      anonymousUser: { user: { id: 'anon1' }, session: {} },
      newUser: { user: { id: 'real1' }, session: {} },
    }
    await onLinkAccount?.(data as never)
    expect(relink).toHaveBeenCalledWith({ fromUserId: 'anon1', toUserId: 'real1' })
    relink.mockRejectedValueOnce(new Error('boom'))
    await expect(onLinkAccount?.(data as never)).rejects.toThrow('boom')
  })

  it('sends the magic link through the mailer', async () => {
    const { sendMagicLink } = pluginOptions(build({}, 'development'), 'magic-link')
    await sendMagicLink?.({ email: 'a@example.com', url: 'http://localhost:3000/x', token: 't' } as never)
    expect(mailer).toHaveBeenCalled()
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'a@example.com',
        subject: 'Your sign-in link for Xenet Opinions',
        text: expect.stringContaining('http://localhost:3000/x'),
      }),
    )
  })

  it('sends the delete-account confirmation through the mailer', async () => {
    const options = build({}, 'production')
    expect(options.user?.deleteUser?.enabled).toBe(true)
    await options.user?.deleteUser?.sendDeleteAccountVerification?.({
      user,
      url: 'http://localhost:3000/d',
      token: 't',
    })
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'a@example.com',
        subject: 'Confirm deleting your Xenet Opinions account',
        text: expect.stringContaining('http://localhost:3000/d'),
      }),
    )
  })

  it('removes stored uploads before deleting the user', async () => {
    await build({}, 'production').user?.deleteUser?.beforeDelete?.(user)
    expect(deleteStorage).toHaveBeenCalledWith('u1')
  })

  it('does not build a mailer while building options', () => {
    build({}, 'development')
    expect(mailer).not.toHaveBeenCalled()
  })
})
