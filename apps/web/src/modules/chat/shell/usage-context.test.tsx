// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { UsageProvider, useUsage } from './usage-context'

afterEach(cleanup)

function Probe() {
  const { usage, bump } = useUsage()
  return (
    <button type="button" onClick={bump}>
      {usage ? `${usage.used}/${usage.max}` : 'none'}
    </button>
  )
}

function SignInProbe() {
  return <span>{useUsage().signIn?.max}</span>
}

const click = () => act(() => screen.getByRole('button').click())

describe('UsageProvider', () => {
  it('bumps used up to max', () => {
    render(
      <UsageProvider usage={{ used: 1, max: 3, resetAt: null }}>
        <Probe />
      </UsageProvider>,
    )
    expect(screen.getByRole('button').textContent).toBe('1/3')
    click()
    expect(screen.getByRole('button').textContent).toBe('2/3')
    click()
    click()
    expect(screen.getByRole('button').textContent).toBe('3/3')
  })

  it('does nothing when usage is null', () => {
    render(
      <UsageProvider usage={null}>
        <Probe />
      </UsageProvider>,
    )
    click()
    expect(screen.getByRole('button').textContent).toBe('none')
  })

  it('re-seeds when the server usage changes', () => {
    const first = { used: 1, max: 3, resetAt: null }
    const { rerender } = render(
      <UsageProvider usage={first}>
        <Probe />
      </UsageProvider>,
    )
    click()
    rerender(
      <UsageProvider usage={{ used: 0, max: 3, resetAt: null }}>
        <Probe />
      </UsageProvider>,
    )
    expect(screen.getByRole('button').textContent).toBe('0/3')
  })

  it('exposes signIn', () => {
    render(
      <UsageProvider usage={null} signIn={{ max: 3 }}>
        <SignInProbe />
      </UsageProvider>,
    )
    expect(screen.getByText('3')).toBeTruthy()
  })
})
