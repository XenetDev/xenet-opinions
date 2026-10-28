// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthProviders } from '@/lib/auth-providers'
import { axe } from '@/test/axe'

const client = vi.hoisted(() => ({ magicLink: vi.fn(), social: vi.fn() }))

vi.mock('@/lib/auth-client', () => ({
  authClient: { signIn: { magicLink: client.magicLink, social: client.social } },
}))

import { SignInForm } from './sign-in-form'

const ALL: AuthProviders = { magicLink: true, google: true, github: true, apple: true }
const NONE: AuthProviders = { magicLink: false, google: false, github: false, apple: false }

beforeEach(() => {
  client.magicLink.mockReset().mockResolvedValue({ data: { status: true }, error: null })
  client.social.mockReset().mockResolvedValue({ data: null, error: null })
})

afterEach(() => {
  cleanup()
})

const email = () => screen.getByRole('textbox', { name: 'Email' }) as HTMLInputElement
const submit = (address = 'ada@example.com') => {
  fireEvent.change(email(), { target: { value: address } })
  fireEvent.click(screen.getByRole('button', { name: 'Send sign-in link' }))
}

describe('SignInForm', () => {
  it('renders the email form and every provider button when all providers are on', () => {
    render(<SignInForm providers={ALL} next="/c/abc" />)
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeTruthy()
    expect(screen.getByText('Enter your email to get a sign-in link.')).toBeTruthy()
    expect(email().type).toBe('email')
    expect(screen.getByText('Your link stays active for 15 minutes.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Send sign-in link' })).toBeTruthy()
    expect(screen.getByText('Or continue with')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Continue with GitHub' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Continue with Apple' })).toBeTruthy()
  })

  it('hides a provider button when its flag is off', () => {
    render(<SignInForm providers={{ ...ALL, apple: false }} next="/" />)
    expect(screen.queryByRole('button', { name: 'Continue with Apple' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeTruthy()
  })

  it('hides the email form and divider when magic link is off', () => {
    render(<SignInForm providers={{ ...ALL, magicLink: false }} next="/" />)
    expect(screen.queryByRole('textbox', { name: 'Email' })).toBeNull()
    expect(screen.queryByText('Or continue with')).toBeNull()
    expect(screen.getByRole('button', { name: 'Continue with GitHub' })).toBeTruthy()
  })

  it('hides the divider when only magic link is on', () => {
    render(<SignInForm providers={{ ...NONE, magicLink: true }} next="/" />)
    expect(email()).toBeTruthy()
    expect(screen.queryByText('Or continue with')).toBeNull()
  })

  it('explains that sign-in is not set up when no provider is on', () => {
    render(<SignInForm providers={NONE} next="/c/abc" />)
    expect(screen.getByRole('heading', { name: 'Sign-in is not set up on this instance' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /hosting docs/i }).getAttribute('href')).toBe(
      'https://github.com/XenetDev/xenet-opinions/blob/main/docs/hosting.md',
    )
    expect(screen.getByRole('link', { name: 'Continue without signing in' }).getAttribute('href')).toBe('/c/abc')
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('sends a magic link to next and shows the sent state', async () => {
    render(<SignInForm providers={ALL} next="/c/abc" />)
    submit()
    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeTruthy()
    expect(client.magicLink).toHaveBeenCalledWith({
      email: 'ada@example.com',
      callbackURL: '/c/abc',
      errorCallbackURL: '/sign-in?next=%2Fc%2Fabc',
    })
    expect(screen.getByText('We sent a sign-in link to ada@example.com.')).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: 'Email' })).toBeNull()
  })

  it('shows the sent state even when the server reports an unknown user', async () => {
    client.magicLink.mockResolvedValue({ data: null, error: { code: 'USER_NOT_FOUND', status: 404 } })
    render(<SignInForm providers={ALL} next="/" />)
    submit()
    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('returns to the form from "Use a different email"', async () => {
    render(<SignInForm providers={ALL} next="/" />)
    submit()
    fireEvent.click(await screen.findByRole('button', { name: 'Use a different email' }))
    expect(email()).toBeTruthy()
  })

  it('shows an alert when the magic link request fails', async () => {
    client.magicLink.mockRejectedValue(new TypeError('Failed to fetch'))
    render(<SignInForm providers={ALL} next="/" />)
    submit()
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(email().value).toBe('ada@example.com')
    expect(screen.queryByRole('heading', { name: 'Check your email' })).toBeNull()
  })

  it('shows an alert when the server fails', async () => {
    client.magicLink.mockResolvedValue({ data: null, error: { status: 500, message: 'Internal Server Error' } })
    render(<SignInForm providers={ALL} next="/" />)
    submit()
    expect((await screen.findByRole('alert')).textContent).toContain('Something went wrong. Try again.')
    expect(screen.queryByRole('heading', { name: 'Check your email' })).toBeNull()
  })

  it('asks for a valid email on a 400', async () => {
    client.magicLink.mockResolvedValue({ data: null, error: { code: 'VALIDATION_ERROR', status: 400, message: 'x' } })
    render(<SignInForm providers={ALL} next="/" />)
    submit()
    expect((await screen.findByRole('alert')).textContent).toContain('Enter a valid email address.')
    expect(screen.queryByRole('heading', { name: 'Check your email' })).toBeNull()
  })

  it('shows the generic alert on another 4xx', async () => {
    client.magicLink.mockResolvedValue({ data: null, error: { code: 'FORBIDDEN', status: 403, message: 'x' } })
    render(<SignInForm providers={ALL} next="/" />)
    submit()
    expect((await screen.findByRole('alert')).textContent).toContain('Something went wrong. Try again.')
    expect(screen.queryByRole('heading', { name: 'Check your email' })).toBeNull()
  })

  it('shows the rate-limit message on a 429', async () => {
    client.magicLink.mockResolvedValue({ data: null, error: { status: 429, message: 'Too many requests' } })
    render(<SignInForm providers={ALL} next="/" />)
    submit()
    expect((await screen.findByRole('alert')).textContent).toContain('Too many attempts. Try again in a minute.')
  })

  it('starts the social flow with the provider and next', async () => {
    render(<SignInForm providers={ALL} next="/c/abc" />)
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))
    await waitFor(() => expect(client.social).toHaveBeenCalledWith({ provider: 'google', callbackURL: '/c/abc' }))
  })

  it('shows an alert when the social flow returns an error', async () => {
    client.social.mockResolvedValue({ data: null, error: { status: 500, message: 'boom' } })
    render(<SignInForm providers={ALL} next="/" />)
    fireEvent.click(screen.getByRole('button', { name: 'Continue with GitHub' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Continue with GitHub' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('disables every button while a request is pending', async () => {
    client.magicLink.mockReturnValue(new Promise(() => {}))
    render(<SignInForm providers={ALL} next="/" />)
    submit()
    await waitFor(() => {
      for (const button of screen.getAllByRole('button')) expect((button as HTMLButtonElement).disabled).toBe(true)
    })
    expect(screen.getByRole('button', { name: 'Send sign-in link' }).getAttribute('aria-busy')).toBe('true')
  })

  it('disables every button while a social redirect is pending', async () => {
    client.social.mockReturnValue(new Promise(() => {}))
    render(<SignInForm providers={ALL} next="/" />)
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Apple' }))
    await waitFor(() => {
      for (const button of screen.getAllByRole('button')) expect((button as HTMLButtonElement).disabled).toBe(true)
    })
  })

  it('shows the expired notice for error="expired"', () => {
    render(<SignInForm providers={ALL} next="/" error="expired" />)
    expect(screen.getByText('That link has expired or was already used. Request a new one.')).toBeTruthy()
  })

  it('has no axe violations in the default, sent and empty states', async () => {
    const { container } = render(<SignInForm providers={ALL} next="/" error="expired" />)
    expect(await axe(container)).toHaveNoViolations()
    submit()
    await screen.findByRole('heading', { name: 'Check your email' })
    expect(await axe(container)).toHaveNoViolations()
    cleanup()
    const empty = render(<SignInForm providers={NONE} next="/" />)
    expect(await axe(empty.container)).toHaveNoViolations()
  })
})
