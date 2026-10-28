import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { schema } from '@xo/db'
import { type BetterAuthOptions, betterAuth } from 'better-auth'
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api'
import { anonymous, magicLink } from 'better-auth/plugins'
import { env } from '@/env'
import type { Env } from '@/env.schema'
import { authProvidersFrom } from '@/lib/auth-providers'
import { db } from '@/lib/db'
import { deleteAccountEmail, magicLinkEmail } from '@/lib/emails'
import { getMailer, type Mailer } from '@/lib/mailer'
import { deleteUserStorage, relinkAnonymousUser } from '@/server/account'

type AuthDeps = {
  env: Env
  nodeEnv: string | undefined
  db: Parameters<typeof drizzleAdapter>[0]
  schema: Record<string, unknown>
  mailer: () => Mailer
  relink: typeof relinkAnonymousUser
  deleteStorage: typeof deleteUserStorage
}

const LINK_INTENT = 'xo.link_intent'

export function buildAuthOptions(deps: AuthDeps) {
  const { env, nodeEnv, mailer, relink, deleteStorage } = deps
  const secureCookies = env.BETTER_AUTH_URL.startsWith('https://')
  const providers = authProvidersFrom(env, nodeEnv)
  const socialProviders: NonNullable<BetterAuthOptions['socialProviders']> = {}
  if (providers.google && env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
    socialProviders.google = { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }
  if (providers.github && env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET)
    socialProviders.github = { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET }
  if (providers.apple && env.APPLE_CLIENT_ID && env.APPLE_CLIENT_SECRET)
    socialProviders.apple = {
      clientId: env.APPLE_CLIENT_ID,
      clientSecret: env.APPLE_CLIENT_SECRET,
      appBundleIdentifier: env.APPLE_APP_BUNDLE_IDENTIFIER,
    }
  return {
    database: drizzleAdapter(deps.db, { provider: 'pg', schema: deps.schema }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [env.NEXT_PUBLIC_APP_URL, ...(providers.apple ? ['https://appleid.apple.com'] : [])],
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 60,
      storage: 'database',
      customRules: {
        '/sign-in/magic-link': { window: 60, max: 3 },
        '/sign-in/anonymous': { window: 60, max: 10 },
        '/delete-user': { window: 60, max: 3 },
      },
    },
    advanced: {
      useSecureCookies: secureCookies,
      ipAddress: { ipAddressHeaders: ['x-forwarded-for', 'x-real-ip'] },
    },
    socialProviders,
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== '/delete-user') return
        const session = await getSessionFromCtx(ctx)
        if (session?.user.isAnonymous) throw new APIError('FORBIDDEN')
      }),
    },
    user: {
      deleteUser: {
        enabled: true,
        sendDeleteAccountVerification: ({ user, url }) =>
          mailer().send({ to: user.email, ...deleteAccountEmail({ url }) }),
        beforeDelete: (user) => deleteStorage(user.id),
      },
    },
    plugins: [
      anonymous({
        disableDeleteAnonymousUser: true,
        onLinkAccount: async ({ anonymousUser, newUser, ctx }) => {
          if (ctx.path === '/magic-link/verify') {
            const intent = await ctx.getSignedCookie(LINK_INTENT, ctx.context.secret)
            ctx.setCookie(LINK_INTENT, '', { path: '/', maxAge: 0 })
            // A magic link only carries anonymous data when the browser that requested it opens it.
            if (intent !== `${anonymousUser.user.id}:${newUser.user.email.toLowerCase()}`) return
          }
          await relink({ fromUserId: anonymousUser.user.id, toUserId: newUser.user.id })
        },
      }),
      ...(providers.magicLink
        ? [
            magicLink({
              expiresIn: 900,
              storeToken: 'hashed',
              sendMagicLink: async ({ email, url }, ctx) => {
                const requester = ctx ? await getSessionFromCtx(ctx, { disableRefresh: true }) : null
                if (ctx && requester?.user.isAnonymous)
                  await ctx.setSignedCookie(
                    LINK_INTENT,
                    `${requester.user.id}:${email.toLowerCase()}`,
                    ctx.context.secret,
                    { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 900, secure: secureCookies },
                  )
                await mailer().send({ to: email, ...magicLinkEmail({ url }) })
              },
            }),
          ]
        : []),
    ],
  } satisfies BetterAuthOptions
}

export const auth = betterAuth(
  buildAuthOptions({
    env,
    nodeEnv: process.env.NODE_ENV,
    db,
    schema,
    mailer: getMailer,
    relink: relinkAnonymousUser,
    deleteStorage: deleteUserStorage,
  }),
)
