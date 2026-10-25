// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { axe } from '@/test/axe'
import { NoticeRegion, useAnnounce } from './notice-region'

afterEach(cleanup)

function Source({ text }: { text: string | null }) {
  const routed = useAnnounce(text)
  return <span role={routed ? undefined : 'status'}>{text}</span>
}

const view = (notice: string | null, badge: string | null) => (
  <NoticeRegion notices={[notice]}>
    <Source text={badge} />
  </NoticeRegion>
)

describe('NoticeRegion', () => {
  it('stays mounted and empty without notices', () => {
    render(view(null, null))
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('renders a single status region for its own and reported notices', () => {
    render(view('Run cancelled', 'Agents offline'))
    expect(screen.getAllByRole('status')).toHaveLength(1)
  })

  it('shows the most recently changed notice', () => {
    const { rerender } = render(view(null, 'Agents available'))
    expect(screen.getByRole('status').textContent).toBe('Agents available')
    rerender(view('Run cancelled', 'Agents available'))
    expect(screen.getByRole('status').textContent).toBe('Run cancelled')
    rerender(view('Run cancelled', 'Agents offline'))
    expect(screen.getByRole('status').textContent).toBe('Agents offline')
    rerender(view('Run cancelled', null))
    expect(screen.getByRole('status').textContent).toBe('Run cancelled')
  })

  it('clears a reported notice when its source unmounts', () => {
    const { rerender } = render(view(null, 'Agents offline'))
    act(() => rerender(<NoticeRegion notices={[null]} />))
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('lets sources render their own status outside a region', () => {
    render(<Source text="Agents offline" />)
    expect(screen.getByRole('status').textContent).toBe('Agents offline')
  })

  it('has no axe violations', async () => {
    const { container } = render(view('Run cancelled', 'Agents offline'))
    expect(await axe(container)).toHaveNoViolations()
  })
})
