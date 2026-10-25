// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { axe } from '@/test/axe'
import { SourcesList } from './sources-list'

afterEach(cleanup)

const data = {
  files: [
    { id: 'f1', filename: 'brief.pdf', mediaType: 'application/pdf', sizeBytes: 2048 },
    { id: 'f2', filename: 'notes.md', mediaType: 'text/markdown', sizeBytes: 512 },
  ],
}

describe('SourcesList', () => {
  it('renders the trigger with the file count', () => {
    render(<SourcesList data={data} />)
    expect(screen.getByRole('button').textContent).toContain('2')
  })

  it('has no axe violations', async () => {
    const { container } = render(<SourcesList data={data} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
