// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import type { Panel } from '@xo/engine/policy'
import { type ComponentProps, useState } from 'react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { axe } from '@/test/axe'
import { ConfigurePanel, clampPanel, defaultPanel, PANEL_STORAGE_KEY, panelSummary, usePanel } from './configure-panel'
import type { RunOptionsValue } from './run-options'

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

type Props = Omit<
  ComponentProps<typeof ConfigurePanel>,
  'value' | 'onChange' | 'runOptions' | 'onRunOptionsChange' | 'open' | 'onOpenChange'
> & { initial?: Panel; rounds?: number }

function Harness({ initial, rounds = 5, ...props }: Props) {
  const [value, setValue] = useState<Panel>(
    initial ?? defaultPanel(props.maxParticipants, props.webResearchAvailable ?? true),
  )
  const [runOptions, setRunOptions] = useState<RunOptionsValue>({ maxRounds: rounds, pauseForInterviews: false })
  const [open, setOpen] = useState(false)
  return (
    <ConfigurePanel
      value={value}
      onChange={setValue}
      runOptions={runOptions}
      onRunOptionsChange={setRunOptions}
      open={open}
      onOpenChange={setOpen}
      {...props}
    />
  )
}

const renderPanel = (props: Partial<Props> = {}) =>
  render(<Harness maxParticipants={25} webResearchAvailable maxRounds={40} allowPause plan="starter" {...props} />)
const open = () => fireEvent.click(screen.getByRole('button', { name: /Configure/ }))
const summary = () => screen.getByTestId('panel-summary').textContent
const chip = (name: string) => screen.getByRole('button', { name })

describe('panelSummary', () => {
  it('formats participants, groups, rounds, research and minutes', () => {
    const panel: Panel = {
      participants: 25,
      groups: ['customers', 'prospects', 'employees', 'dealers'],
      webResearch: true,
    }
    expect(panelSummary(panel, 5, true)).toBe('about 25 participants · 4 groups · 5 rounds · web research on · ~8 min')
    expect(panelSummary({ ...panel, participants: 10, groups: ['media'], webResearch: false }, 1, true)).toBe(
      'about 10 participants · 1 group · 1 round · web research off · ~2 min',
    )
  })

  it('leaves out web research when it is unavailable and groups when none are chosen', () => {
    expect(panelSummary({ participants: 20, groups: [], webResearch: true }, 3, false)).toBe(
      'about 20 participants · 3 rounds · ~5 min',
    )
  })

  it('adds pause on only when pausing is on', () => {
    const panel: Panel = { participants: 20, groups: [], webResearch: true }
    expect(panelSummary(panel, 3, true, true)).toBe(
      'about 20 participants · 3 rounds · web research on · pause on · ~5 min',
    )
    expect(panelSummary(panel, 3, true, false)).not.toContain('pause')
  })

  it('names the audience when set', () => {
    expect(panelSummary({ participants: 20, groups: [], audience: 'Fleet managers', webResearch: true }, 3, true)).toBe(
      'about 20 participants · Fleet managers · 3 rounds · web research on · ~5 min',
    )
  })
})

describe('defaultPanel and clampPanel', () => {
  it('defaults to the plan max on small plans and 20 on bigger ones', () => {
    expect(defaultPanel(10, true)).toEqual({ participants: 10, groups: [], webResearch: true })
    expect(defaultPanel(25, true)).toEqual({ participants: 20, groups: [], webResearch: true })
    expect(defaultPanel(50, false)).toEqual({ participants: 20, groups: [], webResearch: false })
  })

  it('clamps a stored value to the plan and drops what is not valid', () => {
    expect(
      clampPanel(
        {
          participants: 50,
          groups: ['media', 'bogus', 'media', 'customers'],
          audience: '  Owners ',
          webResearch: false,
        },
        10,
        true,
      ),
    ).toEqual({ participants: 10, groups: ['media', 'customers'], audience: 'Owners', webResearch: false })
    expect(clampPanel({ participants: 1, groups: [], webResearch: true }, 25, true).participants).toBe(4)
    expect(clampPanel('nonsense', 25, true)).toEqual(defaultPanel(25, true))
    expect(clampPanel({ participants: 20, groups: [], audience: '   ', webResearch: true }, 25, true)).toEqual({
      participants: 20,
      groups: [],
      webResearch: true,
    })
  })
})

describe('usePanel', () => {
  it('loads the stored value clamped to a lower plan max and persists changes', async () => {
    window.localStorage.setItem(
      PANEL_STORAGE_KEY,
      JSON.stringify({ participants: 50, groups: ['customers'], webResearch: true }),
    )
    const { result } = renderHook(() => usePanel(10, true))
    expect(result.current[0]).toEqual({ participants: 10, groups: ['customers'], webResearch: true })
    act(() => result.current[1]({ participants: 8, groups: [], webResearch: false }))
    expect(result.current[0].participants).toBe(8)
    expect(JSON.parse(window.localStorage.getItem(PANEL_STORAGE_KEY) ?? '')).toEqual({
      participants: 8,
      groups: [],
      webResearch: false,
    })
  })

  it('falls back to the default on bad stored JSON', () => {
    window.localStorage.setItem(PANEL_STORAGE_KEY, '{nope')
    const { result } = renderHook(() => usePanel(25, true))
    expect(result.current[0]).toEqual(defaultPanel(25, true))
  })
})

describe('ConfigurePanel', () => {
  it('shows the summary while closed and the controls when opened', () => {
    renderPanel()
    expect(summary()).toBe('about 20 participants · 5 rounds · web research on · ~7 min')
    expect(screen.queryByRole('slider')).toBeNull()
    open()
    expect(screen.getByRole('slider')).toBeTruthy()
  })

  it('caps the slider at the plan max and names the bigger plan above it', () => {
    renderPanel()
    open()
    const slider = screen.getByRole('slider')
    expect(slider.getAttribute('aria-valuemax')).toBe('25')
    expect(slider.getAttribute('aria-valuemin')).toBe('4')
    expect(screen.getByText(/Starter allows up to 25\./)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Pro' }).getAttribute('href')).toBe('/pricing')
    fireEvent.click(screen.getByRole('button', { name: 'More participants' }))
    fireEvent.click(screen.getByRole('button', { name: 'More participants' }))
    fireEvent.click(screen.getByRole('button', { name: 'More participants' }))
    fireEvent.click(screen.getByRole('button', { name: 'More participants' }))
    fireEvent.click(screen.getByRole('button', { name: 'More participants' }))
    fireEvent.click(screen.getByRole('button', { name: 'More participants' }))
    expect(slider.getAttribute('aria-valuenow')).toBe('25')
    expect((screen.getByRole('button', { name: 'More participants' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('names Starter and Pro on the free plan and no upgrade on Pro', () => {
    renderPanel({ maxParticipants: 10, plan: 'free' })
    open()
    expect(screen.getByText(/Free allows up to 10\./)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Starter' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Pro' })).toBeTruthy()
    cleanup()
    renderPanel({ maxParticipants: 50, plan: 'pro' })
    open()
    expect(screen.getByText(/Pro allows up to 50\./)).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('updates the summary as groups and the audience change', () => {
    renderPanel()
    open()
    fireEvent.click(chip('Customers'))
    fireEvent.click(chip('Dealers/partners'))
    expect(chip('Customers').getAttribute('aria-pressed')).toBe('true')
    expect(summary()).toBe('about 20 participants · 2 groups · 5 rounds · web research on · ~7 min')
    fireEvent.click(chip('Customers'))
    expect(summary()).toBe('about 20 participants · 1 group · 5 rounds · web research on · ~7 min')
    fireEvent.change(screen.getByRole('textbox', { name: 'Audience' }), { target: { value: 'Fleet managers' } })
    expect(summary()).toBe('about 20 participants · Fleet managers · 1 group · 5 rounds · web research on · ~7 min')
  })

  it('stops more groups than participants', () => {
    renderPanel({ initial: { participants: 4, groups: ['customers', 'prospects', 'loyalists'], webResearch: true } })
    open()
    fireEvent.click(chip('Skeptics'))
    expect((chip('Employees') as HTMLButtonElement).disabled).toBe(true)
    expect((chip('Customers') as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByText(/Add participants to include more groups/)).toBeTruthy()
  })

  it('drops the newest groups when participants fall below them', () => {
    renderPanel({
      initial: {
        participants: 5,
        groups: ['customers', 'prospects', 'loyalists', 'skeptics', 'media'],
        webResearch: true,
      },
    })
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Fewer participants' }))
    expect(summary()).toMatch(/^about 4 participants · 4 groups/)
    expect(chip('Media').getAttribute('aria-pressed')).toBe('false')
  })

  it('toggles web research and hides it when unavailable', () => {
    renderPanel()
    open()
    fireEvent.click(screen.getByRole('switch', { name: 'Web research' }))
    expect(summary()).toContain('web research off')
    cleanup()
    renderPanel({ webResearchAvailable: false })
    open()
    expect(screen.queryByRole('switch', { name: 'Web research' })).toBeNull()
    expect(summary()).not.toContain('web research')
  })

  it('sets rounds from a select capped at the plan rounds', () => {
    renderPanel({ maxRounds: 4, rounds: 3 })
    open()
    const select = screen.getByRole('combobox', { name: 'Rounds' })
    expect(select.textContent).toBe('3 rounds')
    fireEvent.keyDown(select, { key: 'Enter' })
    expect(screen.getAllByRole('option').map((item) => item.textContent)).toEqual([
      '1 round',
      '2 rounds',
      '3 rounds',
      '4 rounds',
    ])
    fireEvent.click(screen.getByRole('option', { name: '2 rounds' }))
    expect(summary()).toContain('· 2 rounds ·')
  })

  it('toggles pause for interviews and hides it when the plan does not allow pausing', () => {
    renderPanel()
    open()
    const pause = screen.getByRole('switch', { name: 'Pause for interviews' })
    expect(pause.getAttribute('aria-checked')).toBe('false')
    expect(summary()).not.toContain('pause')
    fireEvent.click(pause)
    expect(pause.getAttribute('aria-checked')).toBe('true')
    expect(summary()).toBe('about 20 participants · 5 rounds · web research on · pause on · ~7 min')
    cleanup()
    renderPanel({ allowPause: false })
    open()
    expect(screen.queryByRole('switch', { name: 'Pause for interviews' })).toBeNull()
    expect(screen.getByRole('combobox', { name: 'Rounds' })).toBeTruthy()
  })

  it('disables rounds and pause with the rest of the panel', () => {
    const props = { maxParticipants: 25, webResearchAvailable: true, maxRounds: 40, allowPause: true }
    const view = render(<Harness {...props} />)
    open()
    view.rerender(<Harness {...props} disabled />)
    expect((screen.getByRole('combobox', { name: 'Rounds' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('switch', { name: 'Pause for interviews' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('has no accessibility violations when open', async () => {
    const { container } = renderPanel()
    open()
    expect(await axe(container)).toHaveNoViolations()
  })
})
