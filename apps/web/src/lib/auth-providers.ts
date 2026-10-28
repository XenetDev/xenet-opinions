import { env } from '@/env'
import type { Env } from '@/env.schema'

export type AuthProviders = { magicLink: boolean; google: boolean; github: boolean; apple: boolean }

type ProviderEnv = Pick<
  Env,
  | 'RESEND_API_KEY'
  | 'GOOGLE_CLIENT_ID'
  | 'GOOGLE_CLIENT_SECRET'
  | 'GITHUB_CLIENT_ID'
  | 'GITHUB_CLIENT_SECRET'
  | 'APPLE_CLIENT_ID'
  | 'APPLE_CLIENT_SECRET'
>

export function authProvidersFrom(source: ProviderEnv, nodeEnv: string | undefined): AuthProviders {
  return {
    magicLink: Boolean(source.RESEND_API_KEY) || nodeEnv !== 'production',
    google: Boolean(source.GOOGLE_CLIENT_ID && source.GOOGLE_CLIENT_SECRET),
    github: Boolean(source.GITHUB_CLIENT_ID && source.GITHUB_CLIENT_SECRET),
    apple: Boolean(source.APPLE_CLIENT_ID && source.APPLE_CLIENT_SECRET),
  }
}

export function authProviders(): AuthProviders {
  return authProvidersFrom(env, process.env.NODE_ENV)
}

export function signInAvailable(): boolean {
  return Object.values(authProviders()).some(Boolean)
}
