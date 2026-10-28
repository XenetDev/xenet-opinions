// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react'
import type { ComponentType } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from '@/test/axe'
import { ASK_QUESTION, AskScene } from './ask'
import { InterviewScene } from './interview'
import { ReportScene } from './report'
import { WatchScene } from './watch'

type SceneComponent = ComponentType<{ active: boolean }>

function stubReducedMotion(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

function elapse(ms: number) {
  const end = Date.now() + ms
  while (vi.getTimerCount() > 0 && Date.now() < end) {
    const next = Math.min(end - Date.now(), 10)
    act(() => vi.advanceTimersByTime(next))
  }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const FINAL: { name: string; Scene: SceneComponent; loopMs: number; expectFinal: () => void }[] = [
  {
    name: 'ask',
    Scene: AskScene,
    loopMs: 9060,
    expectFinal: () => {
      expect(screen.getByText(ASK_QUESTION)).toBeTruthy()
      expect(screen.getByText('pricing-brief.pdf')).toBeTruthy()
      expect(document.querySelector('[data-pulse]')).not.toBeNull()
    },
  },
  {
    name: 'watch',
    Scene: WatchScene,
    loopMs: 9500,
    expectFinal: () => {
      for (const title of ['Reading your documents', 'Building the knowledge graph', 'Generating personas']) {
        expect(screen.getByText(title)).toBeTruthy()
      }
      expect(screen.getByText('Running the simulation')).toBeTruthy()
      expect(screen.getByText('Round 2 of 3')).toBeTruthy()
      for (const initials of ['MC', 'LW', 'PP', 'NO', 'SN', 'OH']) expect(screen.getByText(initials)).toBeTruthy()
    },
  },
  {
    name: 'interview',
    Scene: InterviewScene,
    loopMs: 8600,
    expectFinal: () => {
      const pressed = document.querySelectorAll('[aria-pressed="true"]')
      expect([...pressed].map((card) => card.textContent)).toEqual([
        expect.stringContaining('Maya Chen'),
        expect.stringContaining('Liam Walker'),
      ])
      expect(document.querySelectorAll('[aria-pressed="false"]')).toHaveLength(2)
      expect(screen.getByText('Ask the selected personas…')).toBeTruthy()
      expect(screen.getByText('Still better value than the alternatives, honestly.')).toBeTruthy()
    },
  },
  {
    name: 'report',
    Scene: ReportScene,
    loopMs: 9300,
    expectFinal: () => {
      expect(screen.getByText('Public reaction to the price increase')).toBeTruthy()
      for (const line of [
        'Early posts criticised the timing.',
        'Sentiment stabilised by the midpoint.',
        'Small teams are the main churn risk.',
      ]) {
        expect(screen.getByText(line)).toBeTruthy()
      }
      expect(screen.getByText('pricing-brief.pdf')).toBeTruthy()
      expect(screen.getByText('seed.md')).toBeTruthy()
      expect(screen.getByText('Which segment is most at risk?')).toBeTruthy()
      expect(screen.getByText('Small teams: they name competitors most often.')).toBeTruthy()
    },
  },
]

describe.each(FINAL)('$name scene', ({ Scene, loopMs, expectFinal }) => {
  it('starts at its first frame inside an aria-hidden 16:9 stage', async () => {
    const { container } = render(<Scene active={false} />)
    const stage = screen.getByTestId('guide-scene')
    expect(stage.getAttribute('aria-hidden')).toBe('true')
    expect(stage.className).toContain('aspect-video')
    expect(vi.getTimerCount()).toBe(0)
    vi.useRealTimers()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('reaches its final frame within one loop and passes axe', async () => {
    render(<Scene active />)
    elapse(loopMs - 1)
    expectFinal()
    vi.useRealTimers()
    expect(await axe(document.body)).toHaveNoViolations()
  })

  it('loops back to the first frame', () => {
    render(<Scene active />)
    elapse(loopMs - 1)
    expectFinal()
    elapse(1)
    expect(() => expectFinal()).toThrow()
  })

  it('shows the final frame without timers when reduced motion is preferred', () => {
    stubReducedMotion(true)
    render(<Scene active />)
    expect(vi.getTimerCount()).toBe(0)
    expectFinal()
    act(() => vi.advanceTimersByTime(60_000))
    expectFinal()
  })
})

describe('first frames', () => {
  it('ask starts with an empty composer and no attachment', () => {
    render(<AskScene active />)
    expect(screen.getByText('Ask how people would react to…')).toBeTruthy()
    expect(screen.queryByText('pricing-brief.pdf')).toBeNull()
  })

  it('watch starts reading documents with nothing else running', () => {
    render(<WatchScene active />)
    expect(screen.getByText('Reading your documents')).toBeTruthy()
    expect(screen.queryByText('Round 2 of 3')).toBeNull()
    expect(screen.queryByText('MC')).toBeNull()
  })

  it('interview starts with no persona selected', () => {
    render(<InterviewScene active />)
    expect(document.querySelectorAll('[aria-pressed="true"]')).toHaveLength(0)
    expect(screen.queryByText('Still better value than the alternatives, honestly.')).toBeNull()
  })

  it('report starts with only its heading', () => {
    render(<ReportScene active />)
    expect(screen.getByText('Public reaction to the price increase')).toBeTruthy()
    expect(screen.queryByText('Early posts criticised the timing.')).toBeNull()
  })
})
